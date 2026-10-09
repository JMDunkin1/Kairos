import AppKit

// Package the selected Offset artwork at every macOS icon size without redrawing it.
guard CommandLine.arguments.count == 3 else {
    throw NSError(domain: "QoreIcon", code: 1, userInfo: [NSLocalizedDescriptionKey: "Usage: QoreIcon output.iconset artwork.png"])
}
guard let artwork = NSImage(contentsOfFile: CommandLine.arguments[2]),
      artwork.size.width > 0, artwork.size.width == artwork.size.height else {
    throw NSError(domain: "QoreIcon", code: 2, userInfo: [NSLocalizedDescriptionKey: "The icon artwork must be a readable square image."])
}
let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
for (points, scale) in [(16, 1), (16, 2), (32, 1), (32, 2), (128, 1), (128, 2), (256, 1), (256, 2), (512, 1), (512, 2)] {
    let pixels = points * scale
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    let context = NSGraphicsContext(bitmapImageRep: bitmap)!
    context.imageInterpolation = .high
    NSGraphicsContext.current = context
    let bounds = NSRect(x: 0, y: 0, width: CGFloat(pixels), height: CGFloat(pixels))
    context.cgContext.clear(bounds)
    // Fit the selected tile to the native canvas and clip the cutout's edge fringe.
    let unit = CGFloat(pixels) / 1024
    let tile = NSRect(x: 54 * unit, y: 54 * unit, width: 916 * unit, height: 916 * unit)
    NSBezierPath(roundedRect: tile, xRadius: 205 * unit, yRadius: 205 * unit).addClip()
    NSColor(calibratedRed: 0.975, green: 0.965, blue: 0.946, alpha: 1).setFill()
    tile.fill()
    let sourceTile = NSRect(x: artwork.size.width * 142 / 1254, y: artwork.size.height * 144 / 1254,
                            width: artwork.size.width * 970 / 1254, height: artwork.size.height * 970 / 1254)
    artwork.draw(in: tile, from: sourceTile, operation: .sourceOver, fraction: 1)
    NSGraphicsContext.restoreGraphicsState()
    let suffix = scale == 2 ? "@2x" : ""
    let destination = directory.appendingPathComponent("icon_\(points)x\(points)\(suffix).png")
    try bitmap.representation(using: .png, properties: [:])!.write(to: destination)
}
