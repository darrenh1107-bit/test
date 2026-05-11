const form = document.querySelector(".contact-form");
const note = document.querySelector(".form-note");
const serverStatus = document.querySelector("#server-status");
const liveMessage = document.querySelector("#live-message");
const liveTime = document.querySelector("#live-time");

async function refreshStatus() {
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Status request failed");
    }

    const status = await response.json();
    serverStatus.textContent = status.message;
    liveMessage.textContent = "這個 Darren 網站正在伺服器上運行";
    liveTime.textContent = `伺服器時間：${new Date(status.time).toLocaleString("zh-TW")}`;
  } catch (error) {
    if (location.protocol === "file:") {
      serverStatus.textContent = "請用 http://localhost 或公開網址開啟網站";
      liveMessage.textContent = "目前像是直接開啟檔案，尚未連到網站伺服器";
      liveTime.textContent = "執行 npm start 或部署上線後再重新整理頁面";
      return;
    }

    serverStatus.textContent = "Darren site is online";
    liveMessage.textContent = "這個 Darren 網站正在公開網址上運行";
    liveTime.textContent = `瀏覽器時間：${new Date().toLocaleString("zh-TW")}`;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const name = data.get("name")?.toString().trim() || "你好";

  note.textContent = `${name}，訊息已在這個示範網站中記錄。正式上線時可接上 Email 或表單服務。`;
  form.reset();
});

refreshStatus();
setInterval(refreshStatus, 30000);
