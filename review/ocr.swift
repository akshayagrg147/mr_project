import Foundation
import Vision
import AppKit
let args=CommandLine.arguments.dropFirst()
var output:[[String:Any]]=[]
for path in args {
 let u=URL(fileURLWithPath:path)
 let req=VNRecognizeTextRequest()
 req.recognitionLevel = .accurate
 req.usesLanguageCorrection = true
 try VNImageRequestHandler(url:u,options:[:]).perform([req])
 let rows=(req.results ?? []).map { obs -> [String:Any] in
  let b=obs.boundingBox
  return ["text":obs.topCandidates(1).first?.string ?? "", "x":b.origin.x,"y":b.origin.y,"w":b.width,"h":b.height]
 }
 output.append(["file":u.lastPathComponent,"rows":rows])
}
let data=try JSONSerialization.data(withJSONObject:output,options:[.prettyPrinted,.sortedKeys])
FileHandle.standardOutput.write(data)
