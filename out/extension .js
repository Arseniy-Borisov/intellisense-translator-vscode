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
var _a, _b, _c;
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// src/extension.ts
const vscode = require("vscode");
const axios_1 = require("axios");
const translationCache = new Map();
const OLLAMA_ENDPOINT = (_a = process.env.OLLAMA_ENDPOINT) !== null && _a !== void 0 ? _a : 'http://127.0.0.1:11434/api/generate';
const OLLAMA_MODEL = (_b = process.env.OLLAMA_MODEL) !== null && _b !== void 0 ? _b : 'ali6parmak/hy-mt1.5:1.8b'; //this model is better at 03.2026
const TARGET_LANGUAGE = (_c = process.env.TARGET_LANGUAGE) !== null && _c !== void 0 ? _c : "ru";
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
function translateText(text) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        if (!text)
            return text;
        if (translationCache.has(text))
            return translationCache.get(text);
        try {
            //const prompt = `Translate the following documentation into Russian without changing code or identifiers:\n\n${text}`;
            const prompt = `Translate the following segment into {${TARGET_LANGUAGE}}, without additional explanation.\n\n${text}`;
            const res = yield axios_1.default.post(OLLAMA_ENDPOINT, { model: OLLAMA_MODEL, prompt, max_tokens: 512, stream: false }, { timeout: 12000 });
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
            translationCache.set(text, translated);
            return translated;
        }
        catch (err) {
            console.error('Translation error:', err);
            return text;
        }
    });
}
// Утилита: убирает пустые строки, нормализует, убирает дубликаты, возвращает массив уникальных блоков
function uniqueBlocksFromArray(blocks) {
    const seen = new Set();
    const res = [];
    for (let b of blocks) {
        b = b.trim();
        if (!b)
            continue;
        if (b.includes('**Перевод:**'))
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
    // Hover: запрашиваем hover от language server, но фильтруем блоки,
    // убираем дубликаты и берём только основную документацию для перевода.
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
                    // Собираем все текстовые блоки из всех hover'ов
                    const rawBlocks = [];
                    for (const h of hovs) {
                        for (const c of h.contents) {
                            rawBlocks.push(docToString(c));
                        }
                    }
                    const blocks = uniqueBlocksFromArray(rawBlocks);
                    if (blocks.length === 0)
                        return;
                    const { sigs, doc } = splitSignatureAndDoc(blocks);
                    if (!doc)
                        return;
                    // Если уже где-то есть наш перевод — ничего не делаем
                    if (doc.includes('**Перевод:**')) {
                        // вернуть первый hover как есть, чтобы не ломать UX
                        return hovs[0];
                    }
                    const translated = yield translateText(doc);
                    const md = new vscode.MarkdownString();
                    // сначала показываем сигнатуры / код (если были)
                    if (sigs.length) {
                        //md.appendMarkdown(sigs.join('\n\n') + '\n\n');
                    }
                    // затем основную документацию
                    // затем перевод
                    md.appendMarkdown('**Перевод:**\n' + translated);
                    md.isTrusted = false;
                    return new vscode.Hover(md);
                }
                finally {
                    guard.hover = false;
                }
            });
        }
    };
    // Completion: получаем items от executeCompletionItemProvider, но для каждого item
    // выбираем уникальные блоки документации, берём основной и переводим только его.
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
                        // Получаем текст и разбиваем на логические блоки по двойному переносу строки
                        const full = docToString(item.documentation).trim();
                        if (!full)
                            continue;
                        if (full.includes('**Перевод:**'))
                            continue;
                        // Разобьем на блоки: разделителем считаем два перевода строки
                        // это аккуратно отделит сигнатуры/код и параграфы
                        const candidateBlocks = full.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
                        const blocks = uniqueBlocksFromArray(candidateBlocks);
                        if (blocks.length === 0)
                            continue;
                        const { sigs, doc } = splitSignatureAndDoc(blocks);
                        if (!doc)
                            continue;
                        const translated = yield translateText(doc);
                        const md = new vscode.MarkdownString();
                        if (sigs.length) //md.appendMarkdown(sigs.join('\n\n') + '\n\n');
                            md.appendMarkdown('**Перевод:**\n' + translated);
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
                    if (!full || full.includes('**Перевод:**'))
                        return item;
                    const candidateBlocks = full.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
                    const blocks = uniqueBlocksFromArray(candidateBlocks);
                    if (blocks.length === 0)
                        return item;
                    const { sigs, doc } = splitSignatureAndDoc(blocks);
                    if (!doc)
                        return item;
                    const translated = yield translateText(doc);
                    const md = new vscode.MarkdownString();
                    if (sigs.length) //md.appendMarkdown(sigs.join('\n\n') + '\n\n');
                        md.appendMarkdown('**Перевод:**\n' + translated);
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
//# sourceMappingURL=extension%20.js.map