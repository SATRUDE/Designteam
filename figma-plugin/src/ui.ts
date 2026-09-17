const fileInput = document.getElementById("file") as HTMLInputElement;
const paste = document.getElementById("paste") as HTMLTextAreaElement;
const run = document.getElementById("run") as HTMLButtonElement;

function sendJson(json: string) {
  parent.postMessage({ pluginMessage: { type: "import", json } }, "*");
}

run.onclick = () => {
  const raw = paste.value.trim();
  if (raw) {
    sendJson(raw);
    return;
  }
  const f = fileInput.files?.[0];
  if (!f) {
    alert("Choose a file or paste JSON.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const text = typeof reader.result === "string" ? reader.result : "";
    sendJson(text);
  };
  reader.readAsText(f);
};

fileInput.onchange = () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result === "string") paste.value = reader.result;
  };
  reader.readAsText(f);
};
