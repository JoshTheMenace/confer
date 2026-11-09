// Classic worker running the vendored WASM detector off the main thread.
// apriltag.js loads Comlink from a CDN and exposes itself through it; we skip that and drive the class directly.
const load = self.importScripts.bind(self)
self.importScripts = (...urls) => load(...urls.filter((url) => !url.startsWith('http')))
self.Comlink = { expose() {} }
importScripts('apriltag.js')

const ready = new Promise((resolve) => {
  const detector = new Apriltag(() => { detector.set_return_pose(0); resolve(detector) })
})

// In: { gray: Uint8Array, width, height }. Out: [{ id, corners: [{x,y}x4], center: {x,y} }].
onmessage = async ({ data: { gray, width, height } }) => {
  try {
    const found = (await ready).detect(gray, width, height)
    postMessage(Array.isArray(found) ? found : [])
  } catch {
    postMessage([])
  }
}
