// Turns a portrait into the "robot vision" assets used by the site (all on-device):
//   portrait.png          cut-out, graded: steel shadows, orange key light, cyan rim
//   portrait-thermal.png  thermal camera false colour
//   portrait-edge.png     glowing cyan line-art over a dark silhouette
//   portrait-night.png    green night-vision
//   ../../js/face-data.js face landmarks (normalised to the cut-out) for the scan overlay
// usage: swift robot-vision.swift <input.jpg> <outImgDir> <outJsFile>
import Foundation
import CoreImage
import CoreImage.CIFilterBuiltins
import CoreVideo
import Vision

let args = CommandLine.arguments
let inURL = URL(fileURLWithPath: args[1])
let outDir = URL(fileURLWithPath: args[2], isDirectory: true)
let jsURL = URL(fileURLWithPath: args[3])
try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

guard let input = CIImage(contentsOf: inURL, options: [.applyOrientationProperty: true]) else { fatalError("load") }
let extent = input.extent
let W = Int(extent.width), H = Int(extent.height)
print("input", W, H)
let handler = VNImageRequestHandler(ciImage: input)

// ---------------------------------------------------------------- face + landmarks
let faceReq = VNDetectFaceLandmarksRequest()
try handler.perform([faceReq])
guard let face = faceReq.results?.max(by: { $0.boundingBox.width < $1.boundingBox.width }) else { fatalError("no face") }
let fb = face.boundingBox // normalised, bottom-left origin
let faceCenterTL = CGPoint(x: fb.midX * CGFloat(W), y: (1 - fb.midY) * CGFloat(H))
print("face", fb, "center(tl)", faceCenterTL)

// ---------------------------------------------------------------- subject mask (instance under the face)
let maskReq = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([maskReq])
guard let obs = maskReq.results?.first else { fatalError("no subject") }
print("instances", obs.allInstances.count)
var chosen = IndexSet()
for inst in obs.allInstances {
    let pb = try obs.generateScaledMaskForImage(forInstances: IndexSet(integer: inst), from: handler)
    CVPixelBufferLockBaseAddress(pb, .readOnly)
    let rb = CVPixelBufferGetBytesPerRow(pb)
    let base = CVPixelBufferGetBaseAddress(pb)!
    let row = base.advanced(by: Int(faceCenterTL.y) * rb).assumingMemoryBound(to: Float32.self)
    let v = row[Int(faceCenterTL.x)]
    CVPixelBufferUnlockBaseAddress(pb, .readOnly)
    print(" instance", inst, "value at face", v)
    if v > 0.5 { chosen.insert(inst) }
}
if chosen.isEmpty { chosen = obs.allInstances }
let maskPB = try obs.generateScaledMaskForImage(forInstances: chosen, from: handler)

CVPixelBufferLockBaseAddress(maskPB, .readOnly)
let rowBytes = CVPixelBufferGetBytesPerRow(maskPB)
let mbase = CVPixelBufferGetBaseAddress(maskPB)!
var minX = W, minY = H, maxX = 0, maxY = 0
for y in 0..<H {
    let row = mbase.advanced(by: y * rowBytes).assumingMemoryBound(to: Float32.self)
    for x in 0..<W where row[x] > 0.15 {
        minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
    }
}
CVPixelBufferUnlockBaseAddress(maskPB, .readOnly)
print("bbox(tl) x:\(minX)-\(maxX) y:\(minY)-\(maxY)")

let r1 = CIVector(x: 1, y: 0, z: 0, w: 0)
let mask = CIImage(cvPixelBuffer: maskPB)
    .applyingFilter("CIColorMatrix", parameters: [
        "inputRVector": r1, "inputGVector": r1, "inputBVector": r1,
        "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 0), "inputBiasVector": CIVector(x: 0, y: 0, z: 0, w: 1),
    ])
    .clampedToExtent()
    .applyingFilter("CIMorphologyMinimum", parameters: ["inputRadius": 1.0])
    .applyingGaussianBlur(sigma: 0.8)
    .cropped(to: extent)

// ---------------------------------------------------------------- helpers
func hGradient(_ c0: CIColor, _ c1: CIColor) -> CIImage {
    let f = CIFilter.linearGradient()
    f.point0 = CGPoint(x: extent.minX, y: extent.midY); f.point1 = CGPoint(x: extent.maxX, y: extent.midY)
    f.color0 = c0; f.color1 = c1
    return f.outputImage!.cropped(to: extent)
}
func mixed(_ top: CIImage, over base: CIImage, amount: Double) -> CIImage {
    top.applyingFilter("CIDissolveTransition", parameters: ["inputTargetImage": base, "inputTime": 1 - amount])
}
let clear = CIImage(color: CIColor(red: 0, green: 0, blue: 0, alpha: 0)).cropped(to: extent)
func cut(_ im: CIImage) -> CIImage {
    im.cropped(to: extent).applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: clear, kCIInputMaskImageKey: mask])
}
func gradientMap(_ stops: [(Double, Double, Double, Double)]) -> CIImage {
    // 256x1 palette image for CIColorMap
    var px = [UInt8](repeating: 0, count: 256 * 4)
    for i in 0..<256 {
        let t = Double(i) / 255
        var k = 0
        while k < stops.count - 2 && t > stops[k + 1].0 { k += 1 }
        let a = stops[k], b = stops[k + 1]
        let u = max(0, min(1, (t - a.0) / (b.0 - a.0)))
        px[i * 4] = UInt8((a.1 + (b.1 - a.1) * u) * 255)
        px[i * 4 + 1] = UInt8((a.2 + (b.2 - a.2) * u) * 255)
        px[i * 4 + 2] = UInt8((a.3 + (b.3 - a.3) * u) * 255)
        px[i * 4 + 3] = 255
    }
    let data = Data(px)
    return CIImage(bitmapData: data, bytesPerRow: 256 * 4, size: CGSize(width: 256, height: 1), format: .RGBA8, colorSpace: CGColorSpace(name: CGColorSpace.sRGB))
}

let orange = CIColor(red: 1.0, green: 0.42, blue: 0.1)
let cyan = CIColor(red: 0.24, green: 0.86, blue: 1.0)
let gray = input.applyingFilter("CIColorControls", parameters: ["inputSaturation": 0, "inputContrast": 1.1])

// ---------------------------------------------------------------- 1. graded portrait
var img = input
    .applyingFilter("CIExposureAdjust", parameters: ["inputEV": 0.08])
    .applyingFilter("CIColorControls", parameters: ["inputSaturation": 0.62, "inputContrast": 1.14])
    .applyingFilter("CIHighlightShadowAdjust", parameters: ["inputShadowAmount": 0.3, "inputHighlightAmount": 0.92])
let split = img.applyingFilter("CIFalseColor", parameters: [
    "inputColor0": CIColor(red: 0.03, green: 0.07, blue: 0.12), "inputColor1": CIColor(red: 1.0, green: 0.93, blue: 0.86),
]).applyingFilter("CISoftLightBlendMode", parameters: [kCIInputBackgroundImageKey: img])
img = mixed(split, over: img, amount: 0.5)
let key = hGradient(orange, cyan).applyingFilter("CISoftLightBlendMode", parameters: [kCIInputBackgroundImageKey: img])
img = mixed(key, over: img, amount: 0.48)
let eroded = mask.clampedToExtent().applyingFilter("CIMorphologyMinimum", parameters: ["inputRadius": 10]).cropped(to: extent)
let rimBand = eroded.applyingFilter("CIColorInvert")
    .applyingFilter("CIMultiplyCompositing", parameters: [kCIInputBackgroundImageKey: mask])
    .clampedToExtent().applyingGaussianBlur(sigma: 6).cropped(to: extent)
let rim = hGradient(orange, cyan).applyingFilter("CIMultiplyCompositing", parameters: [kCIInputBackgroundImageKey: rimBand])
img = rim.applyingFilter("CIScreenBlendMode", parameters: [kCIInputBackgroundImageKey: img])
    .applyingFilter("CISharpenLuminance", parameters: ["inputSharpness": 0.25])
let portrait = cut(img)

// ---------------------------------------------------------------- 2. thermal
let thermalPalette = gradientMap([
    (0.0, 0.02, 0.0, 0.08), (0.22, 0.25, 0.0, 0.55), (0.42, 0.8, 0.0, 0.45),
    (0.6, 1.0, 0.35, 0.0), (0.8, 1.0, 0.82, 0.1), (1.0, 1.0, 1.0, 0.92),
])
let thermal = cut(
    gray.applyingFilter("CIGammaAdjust", parameters: ["inputPower": 0.75])
        .applyingFilter("CIColorControls", parameters: ["inputContrast": 1.35])
        .clampedToExtent().applyingGaussianBlur(sigma: 3.5).cropped(to: extent)
        .applyingFilter("CIColorMap", parameters: ["inputGradientImage": thermalPalette])
)

// ---------------------------------------------------------------- 3. edge / wireframe
let edges = gray.clampedToExtent().applyingGaussianBlur(sigma: 1.3).cropped(to: extent)
    .applyingFilter("CIEdges", parameters: ["inputIntensity": 16.0])
    .applyingFilter("CIColorControls", parameters: ["inputSaturation": 0, "inputContrast": 1.15, "inputBrightness": -0.04])
    .applyingFilter("CIColorClamp")
// topographic "depth" contours: posterised luminance bands, then their edges
let contours = gray.applyingFilter("CIGammaAdjust", parameters: ["inputPower": 0.55])
    .clampedToExtent().applyingGaussianBlur(sigma: 3.0).cropped(to: extent)
    .applyingFilter("CIColorPosterize", parameters: ["inputLevels": 9])
    .applyingFilter("CIEdges", parameters: ["inputIntensity": 3.0])
    .applyingFilter("CIColorControls", parameters: ["inputSaturation": 0, "inputBrightness": 0.0, "inputContrast": 1.0])
    .applyingFilter("CIColorMatrix", parameters: [
        "inputRVector": CIVector(x: 1.6, y: 0, z: 0, w: 0), "inputGVector": CIVector(x: 0, y: 1.6, z: 0, w: 0),
        "inputBVector": CIVector(x: 0, y: 0, z: 1.6, w: 0),
    ])
let edgesAll = edges.applyingFilter("CIScreenBlendMode", parameters: [kCIInputBackgroundImageKey: contours]).applyingFilter("CIColorClamp")
let edgeGlow = edgesAll.clampedToExtent().applyingGaussianBlur(sigma: 2.2).cropped(to: extent)
let lines = edgesAll.applyingFilter("CIAdditionCompositing", parameters: [kCIInputBackgroundImageKey: edgeGlow])
    .applyingFilter("CIColorMatrix", parameters: [
        "inputRVector": CIVector(x: 0.4, y: 0, z: 0, w: 0),
        "inputGVector": CIVector(x: 0, y: 1.5, z: 0, w: 0),
        "inputBVector": CIVector(x: 0, y: 0, z: 1.8, w: 0),
    ])
let silhouette = CIImage(color: CIColor(red: 0.01, green: 0.05, blue: 0.08)).cropped(to: extent)
let edgeImg = cut(lines.applyingFilter("CIScreenBlendMode", parameters: [kCIInputBackgroundImageKey: silhouette]))

// ---------------------------------------------------------------- 4. night vision
let night = cut(
    gray.applyingFilter("CIGammaAdjust", parameters: ["inputPower": 0.7])
        .applyingFilter("CIColorControls", parameters: ["inputContrast": 1.25, "inputBrightness": 0.04])
        .applyingFilter("CIFalseColor", parameters: [
            "inputColor0": CIColor(red: 0.0, green: 0.05, blue: 0.02), "inputColor1": CIColor(red: 0.72, green: 1.0, blue: 0.55),
        ])
        .applyingFilter("CISharpenLuminance", parameters: ["inputSharpness": 0.4])
)

// ---------------------------------------------------------------- crop + write
let pad = 12
let cx0 = max(0, minX - pad), cx1 = min(W, maxX + pad)
let cyTop = max(0, minY - pad), cyBot = min(H, maxY + 1)
let cropRect = CGRect(x: CGFloat(cx0), y: CGFloat(H - cyBot), width: CGFloat(cx1 - cx0), height: CGFloat(cyBot - cyTop))
let cw = cropRect.width, ch = cropRect.height
print("crop", cropRect)
func finish(_ im: CIImage) -> CIImage {
    im.cropped(to: cropRect).transformed(by: CGAffineTransform(translationX: -cropRect.minX, y: -cropRect.minY))
}
let ctx = CIContext(options: [.workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!])
let srgb = CGColorSpace(name: CGColorSpace.sRGB)!
for (name, im) in [("portrait", portrait), ("portrait-thermal", thermal), ("portrait-edge", edgeImg), ("portrait-night", night)] {
    try ctx.writePNGRepresentation(of: finish(im), to: outDir.appendingPathComponent("\(name).png"), format: .RGBA8, colorSpace: srgb)
}
let bg = CIImage(color: CIColor(red: 0.03, green: 0.035, blue: 0.045)).cropped(to: extent)
try ctx.writePNGRepresentation(of: finish(portrait.composited(over: bg)), to: outDir.appendingPathComponent("_preview.png"), format: .RGBA8, colorSpace: srgb)

// ---------------------------------------------------------------- landmarks -> JS (0..1 of the cut-out, top-left origin)
func norm(_ p: CGPoint) -> [Double] {
    // p is in image pixels, bottom-left origin
    let x = (p.x - cropRect.minX) / cw
    let y = 1 - (p.y - cropRect.minY) / ch
    return [Double(String(format: "%.4f", x))!, Double(String(format: "%.4f", y))!]
}
var regions: [String: [[Double]]] = [:]
if let lm = face.landmarks {
    let size = CGSize(width: W, height: H)
    let all: [(String, VNFaceLandmarkRegion2D?)] = [
        ("faceContour", lm.faceContour), ("leftEye", lm.leftEye), ("rightEye", lm.rightEye),
        ("leftEyebrow", lm.leftEyebrow), ("rightEyebrow", lm.rightEyebrow), ("nose", lm.nose),
        ("noseCrest", lm.noseCrest), ("medianLine", lm.medianLine), ("outerLips", lm.outerLips),
        ("innerLips", lm.innerLips), ("leftPupil", lm.leftPupil), ("rightPupil", lm.rightPupil),
    ]
    for (name, region) in all {
        guard let region else { continue }
        regions[name] = region.pointsInImage(imageSize: size).map(norm)
    }
}
let fbPx = CGRect(x: fb.minX * CGFloat(W), y: fb.minY * CGFloat(H), width: fb.width * CGFloat(W), height: fb.height * CGFloat(H))
let tl = norm(CGPoint(x: fbPx.minX, y: fbPx.maxY))
let br = norm(CGPoint(x: fbPx.maxX, y: fbPx.minY))
let payload: [String: Any] = [
    "size": [Int(cw), Int(ch)],
    "box": [tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]],
    "regions": regions,
]
let json = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
let js = "/* generated by assets/robot-vision.swift: face landmarks, 0..1 of portrait.png (top-left origin) */\nwindow.FACE = " + String(data: json, encoding: .utf8)! + ";\n"
try js.write(to: jsURL, atomically: true, encoding: .utf8)
print("regions", regions.keys.sorted(), "done")
