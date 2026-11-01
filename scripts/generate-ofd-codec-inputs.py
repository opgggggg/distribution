"""Synthetic codec inputs only; Pillow is needed to regenerate fixtures, not to build the app."""
import base64, io, json, struct, random
from pathlib import Path
from PIL import Image, TiffImagePlugin
cases=[]
def add(name,kind,data,**extra):
    cases.append(dict(name=name,format=kind,bytes=base64.b64encode(data).decode(),**extra))
rgba=Image.new('RGBA',(3,2));rgba.putdata([(255,0,0,255),(0,255,0,128),(0,0,255,0),(200,50,100,255),(10,20,30,64),(255,255,255,255)])
for mode in ['RGB','RGBA','L','1','P','CMYK']:
    image=rgba.convert(mode)
    if mode=='P':
        image=Image.new('P',(3,2));image.putpalette([v for i in range(256) for v in (i,(255-i),i//2)]);image.putdata([0,1,10,64,128,255])
    compressions=['raw','tiff_lzw','tiff_adobe_deflate','packbits']
    if mode=='1':compressions+=['group3','group4']
    if mode=='RGB':compressions+=['jpeg']
    for compression in compressions:
        out=io.BytesIO();image.save(out,format='TIFF',compression=compression)
        add(f'tiff-{mode}-{compression}','TIFF',out.getvalue(),lossy=compression=='jpeg')
    if mode in ['RGB','RGBA','L','1','P']:
        out=io.BytesIO();image.save(out,format='BMP');add(f'bmp-{mode}','BMP',out.getvalue())
for orientation in range(1,9):
    tags=TiffImagePlugin.ImageFileDirectory_v2();tags[274]=orientation
    out=io.BytesIO();rgba.save(out,format='TIFF',compression='tiff_lzw',tiffinfo=tags);add(f'tiff-orientation-{orientation}','TIFF',out.getvalue())
for mode in ['I;16','I;16B']:
    data=b''.join(struct.pack('<H' if mode=='I;16' else '>H',v)for v in [0,65535,32768,1000,50000,10000]);image=Image.frombytes(mode,(3,2),data);out=io.BytesIO();image.save(out,format='TIFF');add(f'tiff-gray16-{mode}','TIFF',out.getvalue())
# Larger, non-byte-aligned images exercise real decompression and strip edges,
# rather than only the original codec's same-sized-strip shortcut.
large=Image.new('RGBA',(17,13));large.putdata([((x*41+y*13)%256,(x*9+y*37)%256,(x*19+y*29)%256,(x*53+y*11)%256)for y in range(13)for x in range(17)])
for mode in ['RGB','RGBA','L','1','P','CMYK']:
    for compression in ['tiff_lzw','tiff_adobe_deflate','packbits']+(['jpeg']if mode=='RGB'else[]):
        out=io.BytesIO();large.convert(mode).save(out,format='TIFF',compression=compression)
        add(f'tiff-large-{mode}-{compression}','TIFF',out.getvalue(),lossy=compression=='jpeg')
for mixed in [0,1]:
    for fill in [1,2]:
        for photo in [0,1]:
            tags=TiffImagePlugin.ImageFileDirectory_v2();tags[292]=mixed;tags[266]=fill;tags[262]=photo
            out=io.BytesIO();large.convert('1').save(out,format='TIFF',compression='group3',tiffinfo=tags)
            add(f'tiff-group3-mixed{mixed}-fill{fill}-photo{photo}','TIFF',out.getvalue())
for fill in [1,2]:
    tags=TiffImagePlugin.ImageFileDirectory_v2();tags[266]=fill
    out=io.BytesIO();large.convert('1').save(out,format='TIFF',compression='group4',tiffinfo=tags)
    add(f'tiff-group4-fill{fill}','TIFF',out.getvalue())
# Explicit white-is-zero values preserve the source codec's interpretation.
for mode,samples in [('RGB',3),('RGBA',4)]:
    rng=random.Random(17);image=Image.frombytes(mode,(7,2),bytes(rng.randrange(8)*16 for _ in range(7*2*samples)))
    tags=TiffImagePlugin.ImageFileDirectory_v2();tags[317]=2
    out=io.BytesIO();image.save(out,format='TIFF',compression='tiff_lzw',tiffinfo=tags)
    assert Image.open(io.BytesIO(out.getvalue())).tag_v2[279][0]==7*2*samples
    add(f'tiff-shortcut-predictor-{mode}','TIFF',out.getvalue())
tags=TiffImagePlugin.ImageFileDirectory_v2();tags[262]=0
out=io.BytesIO();rgba.convert('L').save(out,format='TIFF',tiffinfo=tags);add('tiff-white-is-zero','TIFF',out.getvalue())
for orientation in [0,9]:
    tags=TiffImagePlugin.ImageFileDirectory_v2();tags[274]=orientation
    out=io.BytesIO();rgba.save(out,format='TIFF',tiffinfo=tags);add(f'tiff-invalid-orientation-{orientation}','TIFF',out.getvalue(),reject=True)
out=io.BytesIO();rgba.save(out,format='TIFF',save_all=True,append_images=[rgba]);add('tiff-multipage-rejected','TIFF',out.getvalue(),reject=True)
# Distinct sizes/colors expose accidental first-page reuse or orientation twice.
documents=[]
for endian in ['little','big']:
    mode='I;16' if endian=='little' else 'I;16B'
    first=Image.frombytes(mode,(3,2),b''.join(struct.pack('<H'if endian=='little'else'>H',v)for v in [0,65535,32768,1000,50000,10000]))
    out=io.BytesIO();first.save(out,format='TIFF',save_all=True,append_images=[large.convert('RGB'),rgba],compression='tiff_lzw')
    documents.append(dict(name=f'multi-page-{endian}',bytes=base64.b64encode(out.getvalue()).decode()))
def bmp(name,w,h,bits,data,compression=0,palette=None,masks=None,header_size=40,core=False):
    palette=palette or [];masks=masks or []
    if core:header=struct.pack('<IHHHH',12,w,h,1,bits);pal=b''.join(bytes((b,g,r))for r,g,b in palette);extra=b''
    else:
        header=bytearray(header_size);struct.pack_into('<IiiHHIIiiII',header,0,header_size,w,h,1,bits,compression,len(data),0,0,len(palette),0)
        mask_bytes=b''.join(struct.pack('<I',mask)for mask in masks)
        if header_size>=56:header[40:40+len(mask_bytes)]=mask_bytes;extra=b''
        else:extra=mask_bytes
        pal=b''.join(bytes((b,g,r,0))for r,g,b in palette)
    offset=14+len(header)+len(extra)+len(pal);file=struct.pack('<2sIHHI',b'BM',offset+len(data),0,0,offset)+bytes(header)+extra+pal+data;add(name,'BMP',file)
palette=[(i*17,255-i*17,0)for i in range(16)]
bmp('bmp-4bit-palette',4,2,4,bytes([0x12,0x34,0,0,0x56,0x78,0,0]),palette=palette)
bmp('bmp-core-4bit',4,2,4,bytes([0x12,0x34,0,0,0x56,0x78,0,0]),palette=palette,core=True)
bmp('bmp-16bit-565',2,2,16,struct.pack('<HHHH',0xf800,0x07e0,0x001f,0xffff),compression=3,masks=[0xf800,0x07e0,0x001f])
bmp('bmp-32bit-alpha-fields',2,2,32,struct.pack('<IIII',0xffff0000,0x8000ff00,0x400000ff,0xffffffff),compression=6,masks=[0xff0000,0xff00,0xff,0xff000000])
bmp('bmp-32bit-alpha-header',2,-2,32,struct.pack('<IIII',0xffff0000,0x8000ff00,0x400000ff,0xffffffff),compression=3,masks=[0xff0000,0xff00,0xff,0xff000000],header_size=56)
bmp('bmp-rle8',3,2,8,bytes([3,1,0,0,0,3,2,3,0,0,0,1]),compression=1,palette=palette[:4])
bmp('bmp-rle4',4,2,4,bytes([4,0x12,0,0,0,4,0x34,0x12,0,1]),compression=2,palette=palette)
bmp('bmp-rle8-delta',4,2,8,bytes([0,2,1,0,3,2,0,0,4,1,0,1]),compression=1,palette=palette[:4])
add('bmp-short-header','BMP',b'BM'+bytes(20),reject=True)
root=Path(__file__).resolve().parent.parent
output=root/'.cache/notes-qa/ofd-codec-inputs.json';output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(cases,indent=2)+'\n')
print(f'Generated {len(cases)} synthetic BMP/TIFF inputs')
(root/'.cache/notes-qa/tiff-document-inputs.json').write_text(json.dumps(documents,indent=2)+'\n')
