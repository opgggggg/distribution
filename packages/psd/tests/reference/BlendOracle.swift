import Foundation
import CoreGraphics
import CoreImage
let r = try! JSONSerialization.jsonObject(with:FileHandle.standardInput.readDataToEndOfFile()) as! [String:Any]
let w=r["width"] as! Int,h=r["height"] as! Int,space=CGColorSpace(name:CGColorSpace.sRGB)!
func image(_ key:String)->CGImage{let data=Data(base64Encoded:r[key] as! String)!;return CGImage(width:w,height:h,bitsPerComponent:8,bitsPerPixel:32,bytesPerRow:w*4,space:space,bitmapInfo:CGBitmapInfo(rawValue:CGImageAlphaInfo.premultipliedLast.rawValue),provider:CGDataProvider(data:data as CFData)!,decode:nil,shouldInterpolate:false,intent:.defaultIntent)!}
let modes:[String:CGBlendMode]=["normal":.normal,"multiply":.multiply,"screen":.screen,"overlay":.overlay,"darken":.darken,"lighten":.lighten,"color-dodge":.colorDodge,"color-burn":.colorBurn,"soft-light":.softLight,"hard-light":.hardLight,"difference":.difference,"exclusion":.exclusion,"hue":.hue,"saturation":.saturation,"color":.color,"luminosity":.luminosity]
let rect=CGRect(x:0,y:0,width:w,height:h),mode=r["mode"] as! String
let context=CGContext(data:nil,width:w,height:h,bitsPerComponent:8,bytesPerRow:w*4,space:space,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
if mode == "gaussian" || mode == "motion" {
 let source=CIImage(cgImage:image("source"));let output = mode == "gaussian" ? source.applyingGaussianBlur(sigma:3) : source.applyingFilter("CIMotionBlur",parameters:[kCIInputRadiusKey:12.0/sqrt(12.0),kCIInputAngleKey:0.0])
 let ci=CIContext(options:[.workingColorSpace:NSNull(),.outputColorSpace:NSNull()]);let rendered=ci.createCGImage(output.cropped(to:rect),from:rect,format:.RGBA8,colorSpace:space)!;context.draw(rendered,in:rect)
} else if mode == "color-dodge" || mode == "color-burn" {
 let filter=CIFilter(name:mode == "color-dodge" ? "CIColorDodgeBlendMode":"CIColorBurnBlendMode")!
 filter.setValue(CIImage(cgImage:image("source")),forKey:kCIInputImageKey);filter.setValue(CIImage(cgImage:image("backdrop")),forKey:kCIInputBackgroundImageKey)
 let ci=CIContext(options:[.cacheIntermediates:false]);let rendered=ci.createCGImage(filter.outputImage!,from:rect,format:.RGBA8,colorSpace:space)!
 context.draw(rendered,in:rect)
} else { context.draw(image("backdrop"),in:rect);context.setBlendMode(modes[mode]!);context.draw(image("source"),in:rect) }
print(Data(bytes:context.data!,count:w*h*4).base64EncodedString())
