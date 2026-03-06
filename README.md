# IntelliSense Translator

**Translate IntelliSense hover tooltips directly inside VSCode using a local AI model.**

No cloud. No API keys. Just your local Ollama model.

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/Arseniy-Borisov.intellisense-translator)](https://marketplace.visualstudio.com/items?itemName=Arseniy-Borisov.intellisense-translator)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/Arseniy-Borisov.intellisense-translator)](https://marketplace.visualstudio.com/items?itemName=Arseniy-Borisov.intellisense-translator)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/Arseniy-Borisov.intellisense-translator)](https://marketplace.visualstudio.com/items?itemName=Arseniy-Borisov.intellisense-translator)

---

## ✨ What it does

When you hover over code, IntelliSense shows documentation.  
This extension **automatically translates that tooltip** into your preferred language using a **local Ollama model**.

Perfect for developers who read documentation in their native language.

✔ Works directly inside VSCode  
✔ Uses **local AI (Ollama)**  
✔ Supports **33 languages** (for ali6parmak/hy-mt1.5:1.8b)
✔ No external services

---

## ⚡ Quick Start

1️⃣ Install Ollama and download the model:
`ollama pull ali6parmak/hy-mt1.5:1.8b`

2️⃣ Install **IntelliSense Translator** from the VSCode Marketplace.

3️⃣ Hover over any symbol in your code.

The tooltip will appear **translated automatically**.

---

## 👀 Example

Hover over a function or class:

![Example](https://github.com/user-attachments/assets/09bf664a-7fa1-4a7f-ae6b-630595502d89)

---

## ⚙️ Configuration

You can configure the extension in:
`Settings → Extensions → IntelliSense Translator`

Or directly in `settings.json`:

```json
{
  "intellisenseTranslator.ollamaEndpoint": "http://localhost:11434/api/generate",
  "intellisenseTranslator.ollamaModel": "ali6parmak/hy-mt1.5:1.8b",
  "intellisenseTranslator.targetLanguage": "ru"
}
```

## ℹ️ Limitations

Due to the way VSCode interacts with the TypeScript Server, the extension works only for hover tooltips.

Autocomplete suggestions triggered while typing cannot be translated.


## 🚀 Why this extension exists

Many developers around the world read documentation not in their native language.

This extension makes IntelliSense documentation instantly accessible in your language, while keeping everything local and private.


## ⚠️ Model License Notice

The default model used in the examples (`ali6parmak/hy-mt1.5:1.8b`) is distributed under the **Tencent HY Community License**.

According to the license terms, the model **cannot be used in the European Union, the United Kingdom, or South Korea**.

If you are located in those regions, you should configure the extension to use another Ollama translation model.

This extension itself does **not include or distribute any model** — it simply connects to a local Ollama endpoint.


## 🌍 Supported Languages
for ali6parmak/hy-mt1.5:1.8b

| Language | Code |
|---|---|
| 🇷🇺 Russian | `ru` |
| 🇨🇳 Chinese | `zh` |
| 🇬🇧 English | `en` |
| 🇫🇷 French | `fr` |
| 🇵🇹 Portuguese | `pt` |
| 🇪🇸 Spanish | `es` |
| 🇯🇵 Japanese | `ja` |
| 🇹🇷 Turkish | `tr` |
| 🇸🇦 Arabic | `ar` |
| 🇰🇷 Korean | `ko` |
| 🇹🇭 Thai | `th` |
| 🇮🇹 Italian | `it` |
| 🇩🇪 German | `de` |
| 🇻🇳 Vietnamese | `vi` |
| 🇲🇾 Malay | `ms` |
| 🇮🇩 Indonesian | `id` |
| 🇵🇭 Filipino | `tl` |
| 🇮🇳 Hindi | `hi` |
| 🇹🇼 Traditional Chinese | `zh-Hant` |
| 🇵🇱 Polish | `pl` |
| 🇨🇿 Czech | `cs` |
| 🇳🇱 Dutch | `nl` |
| 🇰🇭 Khmer | `km` |
| 🇲🇲 Burmese | `my` |
| 🇮🇷 Persian | `fa` |
| 🇮🇳 Gujarati | `gu` |
| 🇵🇰 Urdu | `ur` |
| 🇮🇳 Telugu | `te` |
| 🇮🇳 Marathi | `mr` |
| 🇮🇱 Hebrew | `he` |
| 🇧🇩 Bengali | `bn` |
| 🇮🇳 Tamil | `ta` |
| 🇺🇦 Ukrainian | `uk` |
| 🇨🇳 Tibetan | `bo` |
| 🇰🇿 Kazakh | `kk` |
| 🇲🇳 Mongolian | `mn` |
| 🇨🇳 Uyghur | `ug` |
| 🇭🇰 Cantonese | `yue` |