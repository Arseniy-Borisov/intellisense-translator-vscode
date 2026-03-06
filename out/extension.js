"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// src/extension.ts
const vscode = require("vscode");
const axios_1 = require("axios");
const translationCache = new Map();
const SUPPORTED_LANGUAGES = [
    "Chinese", "English", "French", "Portuguese", "Spanish", "Japanese", "Turkish",
    "Russian", "Arabic", "Korean", "Thai", "Italian", "German", "Vietnamese", "Malay",
    "Indonesian", "Filipino", "Hindi", "Traditional Chinese", "Polish", "Czech", "Dutch",
    "Khmer", "Burmese", "Persian", "Gujarati", "Urdu", "Telugu", "Marathi", "Hebrew",
    "Bengali", "Tamil", "Ukrainian", "Tibetan", "Kazakh", "Mongolian", "Uyghur", "Cantonese"
];
// Теперь массив и тип согласованы
const supported = [...SUPPORTED_LANGUAGES];
function docToString(doc) {
    if (!doc)
        return '';
    if (typeof doc === 'string')
        return doc;
    const anyDoc = doc;
    if (typeof anyDoc.value === 'string')
        return anyDoc.value;
    if (typeof anyDoc.toString === 'function')
        return anyDoc.toString();
    return String(doc);
}
function translateText(text, targetLanguage, endpoint, model) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        if (!text)
            return text;
        const cacheKey = `${text}||${targetLanguage}||${model}`;
        if (translationCache.has(cacheKey))
            return translationCache.get(cacheKey);
        try {
            const prompt = `Translate the following segment into {${targetLanguage}}, without additional explanation.\n\n${text}`;
            const res = yield axios_1.default.post(endpoint, { model, prompt, max_tokens: 512, stream: false }, { timeout: 12000 });
            let translated = '';
            if (res.data) {
                if (res.data.response)
                    translated = String(res.data.response);
                else if (res.data.completion)
                    translated = String(res.data.completion);
                else if (res.data.choices && res.data.choices[0]) {
                    translated = String((_c = (_a = res.data.choices[0].text) !== null && _a !== void 0 ? _a : (_b = res.data.choices[0].message) === null || _b === void 0 ? void 0 : _b.content) !== null && _c !== void 0 ? _c : '');
                }
                else {
                    translated = String(res.data);
                }
            }
            else {
                translated = String(res);
            }
            translated = translated.trim();
            translationCache.set(cacheKey, translated);
            return translated;
        }
        catch (err) {
            console.error('Translation error:', err);
            return text;
        }
    });
}
// Утилита: убирает пустые строки, нормализует, убирает дубликаты, возвращает массив уникальных блоков
function uniqueBlocksFromArray(blocks, TARGET_LANGUAGE) {
    const seen = new Set();
    const res = [];
    for (let b of blocks) {
        b = b.trim();
        if (!b)
            continue;
        if (b.includes(`**${TARGET_LANGUAGE}:**`))
            continue; // не берем уже переведённые блоки
        if (!seen.has(b)) {
            seen.add(b);
            res.push(b);
        }
    }
    return res;
}
// Выбирает основной doc-блок (самый длинный); возвращает {sigs, doc}
function splitSignatureAndDoc(blocks) {
    if (!blocks || blocks.length === 0)
        return { sigs: [], doc: null };
    if (blocks.length === 1)
        return { sigs: [], doc: blocks[0] };
    // основной документ — самый длинный блок
    let longest = blocks[0];
    for (const b of blocks) {
        if (b.length > longest.length)
            longest = b;
    }
    const sigs = blocks.filter(b => b !== longest);
    return { sigs, doc: longest };
}
function activate(context) {
    const guard = { hover: false, completion: false, resolve: false };
    const languages = ['javascript', 'typescript', 'typescriptreact', 'javascriptreact'];
    // --- Переменные конфигурации и функция для их обновления ---
    let OLLAMA_ENDPOINT;
    let OLLAMA_MODEL;
    let TARGET_LANGUAGE;
    const loadConfig = () => {
        var _a, _b;
        const config = vscode.workspace.getConfiguration('intellisenseTranslator');
        OLLAMA_ENDPOINT = (_a = config.get('ollamaEndpoint')) !== null && _a !== void 0 ? _a : 'http://127.0.0.1:11434/api/generate';
        OLLAMA_MODEL = (_b = config.get('model')) !== null && _b !== void 0 ? _b : 'ali6parmak/hy-mt1.5:1.8b';
        const rawLang = config.get('targetLanguage');
        TARGET_LANGUAGE = supported.includes(rawLang) ? rawLang : "Russian";
        console.log('Loaded config:', { OLLAMA_ENDPOINT, OLLAMA_MODEL, TARGET_LANGUAGE });
    };
    // Инициализация при запуске
    loadConfig();
    // --- Следим за изменениями конфигурации ---
    vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('intellisenseTranslator.ollamaEndpoint') ||
            event.affectsConfiguration('intellisenseTranslator.model') ||
            event.affectsConfiguration('intellisenseTranslator.targetLanguage')) {
            console.log('Config changed, reloading...');
            loadConfig();
            // Если нужно, здесь можно заново создать клиент OLLAMA или сбросить кэш
        }
    });
    // --- Hover Provider ---
    const hoverProvider = {
        provideHover(document, position, token) {
            return __awaiter(this, void 0, void 0, function* () {
                if (guard.hover)
                    return;
                guard.hover = true;
                try {
                    const hovs = yield vscode.commands.executeCommand('vscode.executeHoverProvider', document.uri, position);
                    if (!hovs || hovs.length === 0)
                        return;
                    const rawBlocks = [];
                    for (const h of hovs) {
                        for (const c of h.contents) {
                            rawBlocks.push(docToString(c));
                        }
                    }
                    const blocks = uniqueBlocksFromArray(rawBlocks, TARGET_LANGUAGE);
                    if (blocks.length === 0)
                        return;
                    const { sigs, doc } = splitSignatureAndDoc(blocks);
                    if (!doc)
                        return;
                    if (doc.includes(`**${TARGET_LANGUAGE}:**`))
                        return hovs[0];
                    const translated = yield translateText(doc, TARGET_LANGUAGE, OLLAMA_ENDPOINT, OLLAMA_MODEL);
                    const md = new vscode.MarkdownString();
                    md.appendMarkdown(`**${TARGET_LANGUAGE}:**\n` + translated);
                    md.isTrusted = false;
                    return new vscode.Hover(md);
                }
                finally {
                    guard.hover = false;
                }
            });
        }
    };
    // --- Completion Provider ---
    const completionProvider = {
        provideCompletionItems(document, position, token, context) {
            return __awaiter(this, void 0, void 0, function* () {
                if (guard.completion)
                    return undefined;
                guard.completion = true;
                try {
                    const raw = yield vscode.commands.executeCommand('vscode.executeCompletionItemProvider', document.uri, position);
                    if (!raw || !raw.items)
                        return undefined;
                    const items = raw.items;
                    for (const item of items) {
                        const full = docToString(item.documentation).trim();
                        if (!full || full.includes(`**${TARGET_LANGUAGE}:**`))
                            continue;
                        const candidateBlocks = full.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
                        const blocks = uniqueBlocksFromArray(candidateBlocks, TARGET_LANGUAGE);
                        if (!blocks.length)
                            continue;
                        const { sigs, doc } = splitSignatureAndDoc(blocks);
                        if (!doc)
                            continue;
                        const translated = yield translateText(doc, TARGET_LANGUAGE, OLLAMA_ENDPOINT, OLLAMA_MODEL);
                        const md = new vscode.MarkdownString();
                        md.appendMarkdown(`**${TARGET_LANGUAGE}:**\n` + translated);
                        md.isTrusted = false;
                        item.documentation = md;
                    }
                    return new vscode.CompletionList(items, raw.isIncomplete === true);
                }
                finally {
                    guard.completion = false;
                }
            });
        },
        resolveCompletionItem(item, token) {
            return __awaiter(this, void 0, void 0, function* () {
                if (guard.resolve)
                    return item;
                guard.resolve = true;
                try {
                    const full = docToString(item.documentation).trim();
                    if (!full || full.includes(`**${TARGET_LANGUAGE}:**`))
                        return item;
                    const candidateBlocks = full.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
                    const blocks = uniqueBlocksFromArray(candidateBlocks, TARGET_LANGUAGE);
                    if (!blocks.length)
                        return item;
                    const { sigs, doc } = splitSignatureAndDoc(blocks);
                    if (!doc)
                        return item;
                    const translated = yield translateText(doc, TARGET_LANGUAGE, OLLAMA_ENDPOINT, OLLAMA_MODEL);
                    const md = new vscode.MarkdownString();
                    md.appendMarkdown(`**${TARGET_LANGUAGE}:**\n` + translated);
                    md.isTrusted = false;
                    item.documentation = md;
                    return item;
                }
                finally {
                    guard.resolve = false;
                }
            });
        }
    };
    context.subscriptions.push(vscode.languages.registerHoverProvider(languages, hoverProvider));
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(languages, completionProvider));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map