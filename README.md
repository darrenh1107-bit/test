# Darren Website

Darren 的個人網站，可用本機伺服器預覽，也可直接部署到 Netlify、Vercel 或 GitHub Pages。

## 本機預覽

```powershell
npm start
```

開啟：

```text
http://localhost:5173/
```

## GitHub Pages 上線

1. 到 https://github.com/new 建立新的 repository
2. Repository name 可填 `darren-website`
3. Visibility 可選 `Public`
4. 建立後，選擇 `uploading an existing file`
5. 上傳這個資料夾內的檔案
6. 到 `Settings` -> `Pages`
7. Source 選 `Deploy from a branch`
8. Branch 選 `main`，Folder 選 `/root`
9. 儲存後等待 GitHub Pages 產生公開網址

公開網址通常會是：

```text
https://你的GitHub帳號.github.io/darren-website/
```

## Netlify Drop

也可以開啟 https://app.netlify.com/drop，將整個 `darren-website` 資料夾拖到網頁中。

## 靜態檔案

這個網站上線需要：

- `index.html`
- `styles.css`
- `script.js`
- `.nojekyll`

`server.mjs` 只用於本機預覽，不是 Netlify Drop 必需檔案。
