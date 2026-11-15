import Foundation
import CoreImage
import ImageIO
import UniformTypeIdentifiers

enum ExportError: Error { case render }
enum BackgroundQuality { case basic, advanced }
struct FilterSettings { var backgroundQuality: BackgroundQuality = .basic; var refineEdges: Double = 0; var shiftEdge: Double = 0; var matteContrast: Double = 0 }
enum PixelAdjust {
 static let context = CIContext(options: [.useSoftwareRenderer: false])
 static func render(_ image: CIImage, width: Int, height: Int, isMask: Bool) throws -> CGImage {
  guard let result=context.createCGImage(image, from:CGRect(x:0,y:0,width:width,height:height), format:isMask ? .L8 : .RGBA8, colorSpace:isMask ? CGColorSpaceCreateDeviceGray() : CGColorSpaceCreateDeviceRGB()) else {throw ExportError.render};return result
 }
}
enum BrushRaster {
 static func context(width:Int,height:Int,mask:Bool) throws -> CGContext {
 guard let result=CGContext(data:nil,width:width,height:height,bitsPerComponent:8,bytesPerRow:width*(mask ? 1 : 4),space:mask ? CGColorSpaceCreateDeviceGray():CGColorSpaceCreateDeviceRGB(),bitmapInfo:mask ? CGImageAlphaInfo.none.rawValue:CGImageAlphaInfo.premultipliedLast.rawValue) else {throw ExportError.render};return result
 }
 static func draw(_ image:CGImage,in rect:CGRect,mask:Bool,context:CGContext){context.draw(image,in:rect)}
}
struct Request:Decodable {let operation:String;let data:String;let advanced:Bool?;let refineEdges:Double?;let shiftEdge:Double?;let contrast:Double?}
var lastData:Data?,lastImage:CGImage?
func image(_ data:Data)throws->CGImage {
 if data==lastData,let cached=lastImage{return cached}
 guard let source=CGImageSourceCreateWithData(data as CFData,nil),let props=CGImageSourceCopyPropertiesAtIndex(source,0,nil) as? [CFString:Any],let w=props[kCGImagePropertyPixelWidth] as? Int,let h=props[kCGImagePropertyPixelHeight] as? Int,w>0,h>0,w<=30000,h<=30000,w*h<=80_000_000 else {throw NSError(domain:"PSD",code:1,userInfo:[NSLocalizedDescriptionKey:"Invalid or oversized image"])}
 let options:[CFString:Any]=[kCGImageSourceCreateThumbnailFromImageAlways:true,kCGImageSourceCreateThumbnailWithTransform:true,kCGImageSourceThumbnailMaxPixelSize:max(w,h)]
 guard let result=CGImageSourceCreateThumbnailAtIndex(source,0,options as CFDictionary) else {throw ExportError.render}
 lastData=data;lastImage=result;return result
}
while let line=readLine(){
 do {
  guard line.utf8.count<=70_000_000 else {throw ExportError.render}
  let request=try JSONDecoder().decode(Request.self,from:Data(line.utf8))
  guard let data=Data(base64Encoded:request.data),data.count<=48*1024*1024 else {throw ExportError.render}
  var output=try image(data)
  if request.operation=="foreground" {
   if #available(macOS 14.0,*) {
    let settings=FilterSettings(backgroundQuality:request.advanced==true ? .advanced:.basic,refineEdges:min(100,max(0,request.refineEdges ?? 0)),shiftEdge:min(100,max(-100,request.shiftEdge ?? 0)),matteContrast:min(100,max(0,request.contrast ?? 0)))
    output=try SubjectRemoval.subjectMask(output,under:nil,settings:settings)
   } else {throw NSError(domain:"PSD",code:2,userInfo:[NSLocalizedDescriptionKey:"Background removal requires macOS 14 or newer"])}
  } else if request.operation != "decode" {throw ExportError.render}
  let png=NSMutableData();guard let destination=CGImageDestinationCreateWithData(png,UTType.png.identifier as CFString,1,nil) else {throw ExportError.render};CGImageDestinationAddImage(destination,output,nil);guard CGImageDestinationFinalize(destination) else {throw ExportError.render}
  let response=try JSONSerialization.data(withJSONObject:["data":(png as Data).base64EncodedString()]);print(String(decoding:response,as:UTF8.self))
 }catch {let response=try! JSONSerialization.data(withJSONObject:["error":error.localizedDescription]);print(String(decoding:response,as:UTF8.self))}
 fflush(stdout)
}
