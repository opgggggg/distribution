//! Portable authorities for distribution-owned formats. No DOM, filesystem or UI.
pub mod epub;
pub mod ofd;
pub mod pdf;
pub mod search;
pub mod text;
use office_browser_abi::{BrowserKernel, KernelError};
use serde_json::{json, Value};
pub type Result<T> = std::result::Result<T, KernelError>;
pub fn error(code: &str, message: impl Into<String>) -> KernelError {
    KernelError::new(code, message)
}

enum UploadTarget {
    PdfImage,
    DocumentPart,
    RenderPart,
    RenderAsset(String),
}

#[derive(Default)]
pub struct FormatsKernel {
    format: String,
    text: Option<text::TextSession>,
    epub: Option<epub::Book>,
    ofd: Option<ofd::Package>,
    pdf: Option<pdf::Session>,
    signing: Option<ofd::signatures::Signing>,
    verification: Option<ofd::signatures::VerificationPlan>,
    render_package: Option<ofd::Package>,
    render_assets: ofd::render::Assets,
    render_asset_bytes: usize,
    upload_target: Option<UploadTarget>,
    validation: Option<ofd::validate::ValidationPlan>,
    encoding: String,
    resource: Option<Vec<u8>>,
    config: Value,
}
impl BrowserKernel for FormatsKernel {
    fn open(&mut self, bytes: Vec<u8>) -> Result<Value> {
        match self.format.as_str() {
            "text" => {
                if self.config["decodeOnly"] == true {
                    return text::decode_page(&bytes, &self.config);
                }
                let limit = self.config["maxBytes"]
                    .as_u64()
                    .unwrap_or(text::MAX_BYTES as u64)
                    .min(64 * 1024 * 1024) as usize;
                let text = text::TextSession::open_with_limit(bytes, &self.encoding, limit)?;
                let state = text.projection();
                self.text = Some(text);
                Ok(state)
            }
            "epub" => {
                let book = epub::Book::open(bytes)?;
                let projection = book.projection();
                self.epub = Some(book);
                self.resource = None;
                Ok(projection)
            }
            "ofd" => {
                let package = ofd::Package::open(bytes, &self.config)?;
                let state = package.state();
                self.ofd = Some(package);
                self.signing = None;
                self.verification = None;
                self.validation = None;
                self.render_package = None;
                self.render_assets.clear();
                self.render_asset_bytes = 0;
                self.upload_target = None;
                self.resource = None;
                Ok(state)
            }
            "pdf" => {
                self.upload_target = None;
                let document = if self.config["imagePages"] == true {
                    pdf::Session::image_pages(&bytes)?
                } else {
                    pdf::Session::open(bytes, self.config["imageMime"].as_str())?
                };
                let state = document.state();
                self.pdf = Some(document);
                Ok(state)
            }
            _ => Err(error("InvalidState", "Configure a format before opening.")),
        }
    }
    fn request(&mut self, r: Value) -> Result<Value> {
        let op = r["op"]
            .as_str()
            .ok_or_else(|| error("InvalidArgument", "Missing operation."))?;
        if op == "configure" {
            let format = r["format"].as_str().unwrap_or("");
            if !["text", "epub", "ofd", "pdf"].contains(&format) {
                return Err(error("UnsupportedFormat", "Unsupported format."));
            }
            self.format = format.into();
            self.encoding = r["encoding"].as_str().unwrap_or("utf-8").into();
            self.config = r.clone();
            self.text = None;
            self.epub = None;
            self.ofd = None;
            self.pdf = None;
            self.signing = None;
            self.verification = None;
            self.validation = None;
            self.render_package = None;
            self.render_assets.clear();
            self.render_asset_bytes = 0;
            self.upload_target = None;
            self.resource = None;
            return Ok(json!({"kernel":"rust"}));
        }
        if op == "decode" {
            return text::decode_request(&r);
        }
        if op == "search" {
            return search::request(&r);
        }
        if self.format == "pdf" {
            if op == "preparePdfImage" {
                self.upload_target = None;
                if self.pdf.is_none() {
                    return Err(error(
                        "InvalidState",
                        "Open a PDF before uploading a signature.",
                    ));
                }
                self.upload_target = Some(UploadTarget::PdfImage);
                return Ok(json!({"prepared":true,"extensionVersion":1}));
            }
            return self
                .pdf
                .as_mut()
                .ok_or_else(|| error("InvalidState", "No PDF is open."))?
                .request(&r);
        }
        if self.format == "ofd" {
            if op == "initParts" {
                self.signing = None;
                self.verification = None;
                self.validation = None;
                self.render_package = None;
                self.render_assets.clear();
                self.render_asset_bytes = 0;
                self.upload_target = None;
                self.ofd = Some(ofd::Package::empty(&self.config)?);
                self.resource = None;
            }
            let package = self
                .ofd
                .as_mut()
                .ok_or_else(|| error("InvalidState", "No OFD package is open."))?;
            match op {
                "initParts" | "state" => return Ok(package.state()),
                "beginEdit" => {
                    package.begin_edit()?;
                    return Ok(package.state());
                }
                "signBegin" => {
                    let (edited, signing) = ofd::signatures::Signing::begin(package, &r)?;
                    let plan = signing.projection();
                    self.ofd = Some(edited);
                    self.signing = Some(signing);
                    self.resource = None;
                    return Ok(plan);
                }
                "signDescriptor" => {
                    let signing = self.signing.as_ref().ok_or_else(|| {
                        error(
                            "InvalidState",
                            "Begin signing before generating a descriptor.",
                        )
                    })?;
                    let bytes = signing.descriptor(&r["hashes"])?;
                    package.set(&signing.descriptor, bytes.clone())?;
                    self.resource = Some(bytes);
                    return Ok(json!({"path":signing.descriptor}));
                }
                "verifyPlan" => {
                    let plan = ofd::signatures::VerificationPlan::new(package)?;
                    let output = plan.projection();
                    self.verification = Some(plan);
                    return Ok(output);
                }
                "verifyFinish" => {
                    return self
                        .verification
                        .as_ref()
                        .ok_or_else(|| {
                            error(
                                "InvalidState",
                                "Prepare verification before submitting results.",
                            )
                        })?
                        .finish(&r["digests"], &r["providers"]);
                }
                "describe" => return Ok(json!(package.describe(&r)?)),
                "documentPath" => {
                    return Ok(
                        json!({"path":ofd::metadata::document_path(package,r["index"].as_u64().unwrap_or(0) as usize,r["version"].as_str())?}),
                    )
                }
                "decodeImage" => {
                    let path = r["path"]
                        .as_str()
                        .ok_or_else(|| error("InvalidPath", "Missing image path."))?;
                    let bytes = package.read(path)?;
                    self.resource = Some(ofd::codecs::decode(
                        &bytes,
                        r["format"].as_str().unwrap_or(""),
                    )?);
                    return Ok(json!({"kernel":"rust","decoded":true}));
                }
                "decodeTiffPage" => {
                    let path = r["path"]
                        .as_str()
                        .ok_or_else(|| error("InvalidPath", "Missing image path."))?;
                    let page = r["page"]
                        .as_u64()
                        .and_then(|n| usize::try_from(n).ok())
                        .ok_or_else(|| error("InvalidPage", "Invalid TIFF page."))?;
                    let (png, pages) = ofd::codecs::tiff_page(&package.read(path)?, page)?;
                    let width = u32::from_be_bytes(png[16..20].try_into().unwrap());
                    let height = u32::from_be_bytes(png[20..24].try_into().unwrap());
                    self.resource = Some(png);
                    return Ok(
                        json!({"kernel":"rust","pages":pages,"width":width,"height":height}),
                    );
                }
                "validationPlan" => {
                    let plan = ofd::validate::ValidationPlan::new(package);
                    let projection = plan.projection();
                    self.validation = Some(plan);
                    return Ok(projection);
                }
                "validationFinish" => {
                    return self
                        .validation
                        .as_ref()
                        .ok_or_else(|| {
                            error(
                                "InvalidState",
                                "Prepare validation before submitting schema results.",
                            )
                        })?
                        .finish(&r["schemas"]);
                }
                "renderBegin" => {
                    self.render_package = Some(package.snapshot());
                    self.render_assets.clear();
                    self.render_asset_bytes = 0;
                    self.upload_target = None;
                    self.resource = None;
                    return Ok(json!({"kernel":"rust","hostVersion":1}));
                }
                "renderEnd" => {
                    self.render_package = None;
                    self.render_assets.clear();
                    self.render_asset_bytes = 0;
                    self.upload_target = None;
                    self.resource = None;
                    return Ok(json!({"closed":true}));
                }
                "prepareAsset" => {
                    self.upload_target = None;
                    if self.render_package.is_none() {
                        return Err(error(
                            "InvalidState",
                            "Begin rendering before uploading assets.",
                        ));
                    }
                    let key = r["key"]
                        .as_str()
                        .filter(|k| !k.is_empty() && k.len() <= 1024)
                        .ok_or_else(|| error("InvalidArgument", "Invalid render asset key."))?;
                    self.upload_target = Some(UploadTarget::RenderAsset(key.into()));
                    return Ok(json!({"prepared":true,"extensionVersion":1}));
                }
                "render" => {
                    let snapshot = self.render_package.as_mut().ok_or_else(|| {
                        error("InvalidState", "Begin rendering before reading pages.")
                    })?;
                    let host = ofd::render::host::ImportedColorHost {
                        active: r["options"]["colorConverter"] == true,
                    };
                    return ofd::render::render(
                        snapshot,
                        r["options"].clone(),
                        &self.render_assets,
                        &host,
                    );
                }
                "preparePart" => {
                    self.upload_target = None;
                    let is_render = r["render"] == true;
                    let target = if is_render {
                        self.render_package.as_mut().ok_or_else(|| {
                            error(
                                "InvalidState",
                                "Begin rendering before uploading overrides.",
                            )
                        })?
                    } else {
                        package
                    };
                    target.prepare_part(
                        r["path"]
                            .as_str()
                            .ok_or_else(|| error("InvalidPath", "Missing part path."))?,
                    )?;
                    self.upload_target = Some(if is_render {
                        UploadTarget::RenderPart
                    } else {
                        UploadTarget::DocumentPart
                    });
                    return Ok(json!({"prepared":true,"extensionVersion":1}));
                }
                "part" => {
                    self.resource = Some(
                        package.read(
                            r["path"]
                                .as_str()
                                .ok_or_else(|| error("InvalidPath", "Missing part path."))?,
                        )?,
                    );
                    return Ok(json!({"found":true}));
                }
                "xml" => {
                    return package.xml(
                        r["path"]
                            .as_str()
                            .ok_or_else(|| error("InvalidPath", "Missing part path."))?,
                    )
                }
                "textPart" => {
                    return Ok(
                        json!({"text":package.text(r["path"].as_str().ok_or_else(||error("InvalidPath","Missing part path."))?)?}),
                    )
                }
                "remove" => {
                    package.remove(
                        r["path"]
                            .as_str()
                            .ok_or_else(|| error("InvalidPath", "Missing part path."))?,
                    )?;
                    return Ok(package.state());
                }
                "write" => {
                    let mut snapshot = package.snapshot();
                    self.resource = Some(snapshot.write(r["allowInvalidSignatures"] == true)?);
                    return Ok(package.state());
                }
                "source" => {
                    self.resource = Some(package.original()?);
                    return Ok(package.state());
                }
                _ => return Err(error("InvalidArgument", "Unknown OFD operation.")),
            }
        }
        match self.format.as_str() {
            "text" => self
                .text
                .as_mut()
                .ok_or_else(|| error("InvalidState", "No text is open."))?
                .request(r),
            "epub" => {
                let book = self
                    .epub
                    .as_mut()
                    .ok_or_else(|| error("InvalidState", "No EPUB is open."))?;
                match op {
                    "resource" => {
                        let path = r["path"]
                            .as_str()
                            .ok_or_else(|| error("InvalidArgument", "Missing resource path."))?;
                        self.resource = book.read(path, r["deobfuscate"] == true)?;
                        Ok(json!({"found":self.resource.is_some()}))
                    }
                    "resourceText" => {
                        let path = r["path"]
                            .as_str()
                            .ok_or_else(|| error("InvalidArgument", "Missing resource path."))?;
                        Ok(json!({"text":book.resource_text(path,r["deobfuscate"]==true)?}))
                    }
                    "projection" => Ok(book.projection()),
                    "source" => {
                        self.resource = None;
                        Ok(json!({"kernel":"rust"}))
                    }
                    _ => Err(error("InvalidArgument", "Unknown EPUB operation.")),
                }
            }
            _ => Err(error("InvalidState", "No format is configured.")),
        }
    }
    fn save(&mut self) -> Result<Vec<u8>> {
        match self.format.as_str() {
            "pdf" => self
                .pdf
                .as_ref()
                .ok_or_else(|| error("InvalidState", "No PDF is open."))?
                .save(),
            "text" => self
                .text
                .as_ref()
                .ok_or_else(|| error("InvalidState", "No text is open."))?
                .encode(),
            "epub" => self.resource.as_ref().cloned().map(Ok).unwrap_or_else(|| {
                self.epub
                    .as_ref()
                    .map(|b| b.source().to_vec())
                    .ok_or_else(|| error("InvalidState", "No EPUB is open."))
            }),
            "ofd" => self.resource.as_ref().cloned().map(Ok).unwrap_or_else(|| {
                self.ofd
                    .as_ref()
                    .ok_or_else(|| error("InvalidState", "No OFD package is open."))?
                    .original()
            }),
            _ => Err(error("InvalidState", "No document is open.")),
        }
    }
}
office_browser_abi::export_browser_kernel!(FormatsKernel);

/// Distribution-owned binary upload extension v1. The base Office ABI remains v1.
/// # Safety
/// `ptr`/`len` must identify live memory in this instance, allocated by office_alloc.
#[no_mangle]
pub unsafe extern "C" fn cubeoffice_formats_upload(ptr: *const u8, len: usize) -> u32 {
    let bytes = std::slice::from_raw_parts(ptr, len);
    office_browser_abi::output(OFFICE_BROWSER_KERNEL.with(|kernel| {
        let mut kernel = kernel.borrow_mut();
        match kernel
            .upload_target
            .take()
            .ok_or_else(|| error("InvalidState", "Prepare an upload destination first."))?
        {
            UploadTarget::PdfImage => office_browser_abi::json_bytes(
                &kernel
                    .pdf
                    .as_mut()
                    .ok_or_else(|| error("InvalidState", "No PDF is open."))?
                    .upload_image(bytes)?,
            ),
            UploadTarget::DocumentPart => office_browser_abi::json_bytes(
                &kernel
                    .ofd
                    .as_mut()
                    .ok_or_else(|| error("InvalidState", "No OFD package is open."))?
                    .upload(bytes.to_vec())?,
            ),
            UploadTarget::RenderPart => office_browser_abi::json_bytes(
                &kernel
                    .render_package
                    .as_mut()
                    .ok_or_else(|| error("InvalidState", "No render snapshot is open."))?
                    .upload(bytes.to_vec())?,
            ),
            UploadTarget::RenderAsset(key) => {
                let old = kernel.render_assets.get(&key).map_or(0, |b| b.len());
                let total = kernel
                    .render_asset_bytes
                    .saturating_sub(old)
                    .checked_add(bytes.len())
                    .filter(|n| *n <= 128 * 1024 * 1024)
                    .ok_or_else(|| {
                        error("LimitExceeded", "Render assets exceed their byte budget.")
                    })?;
                if kernel.render_assets.len() >= 10000 && !kernel.render_assets.contains_key(&key) {
                    return Err(error("LimitExceeded", "Too many render assets."));
                }
                kernel.render_assets.insert(key, bytes.to_vec().into());
                kernel.render_asset_bytes = total;
                office_browser_abi::json_bytes(&json!({"uploaded":true}))
            }
        }
    }))
}
