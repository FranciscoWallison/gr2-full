// v86wrapper.js - shim de compatibilidade (evita crash quando chamam V86/v86 sem config)
(function (global) {
  const defaults = {
    autostart: false,
    disable_speaker: true,
    // Se você não tiver a pasta build/, troque para "./v86.wasm"
    wasm_path: "build/v86.wasm",
  };

  function shimConstructor(Orig) {
    function Ctor(opts) {
      return new Orig(Object.assign({}, defaults, opts || {}));
    }
    Ctor.prototype = Orig.prototype;
    try { Object.assign(Ctor, Orig); } catch (_) {}
    return Ctor;
  }

  if (typeof global.V86 === "function") {
    global.V86 = shimConstructor(global.V86);
    global.v86 = global.V86;
    global.v86WrapperInit = global.V86;
  } else if (typeof global.V86Starter === "function") {
    global.V86Starter = shimConstructor(global.V86Starter);
    global.v86 = global.V86Starter;
    global.v86WrapperInit = global.V86Starter;
  } else {
    console.error("v86wrapper.js: libv86.js não carregou (V86/V86Starter indefinido)");
  }
})(typeof window !== "undefined" ? window : self);
