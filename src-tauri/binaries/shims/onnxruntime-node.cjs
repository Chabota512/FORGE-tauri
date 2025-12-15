// Shim to prevent onnxruntime-node from being loaded in pkg bundle
// Forces transformers.js to use WASM backend
module.exports = {
  InferenceSession: { create: () => { throw new Error("Use WASM backend"); } },
  Tensor: function() { throw new Error("Use WASM backend"); }
};