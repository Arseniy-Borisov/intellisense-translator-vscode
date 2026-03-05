// src/extension.ts
import * as vscode from 'vscode';
import axios from 'axios';

const translationCache = new Map<string, string>();

export type LanguageCode = | "zh" | "en" | "fr" | "pt" | "es" | "ja" | "tr" | "ru" | "ar" | "ko" | "th" | "it" | "de" | "vi" | "ms" | "id" | "tl" | "hi" | "zh-Hant" | "pl" | "cs" | "nl" | "km" | "my" | "fa" | "gu" | "ur" | "te" | "mr" | "he" | "bn" | "ta" | "uk" | "bo" | "kk" | "mn" | "ug" | "yue";

const OLLAMA_ENDPOINT:string = process.env.OLLAMA_ENDPOINT ?? 'http://127.0.0.1:11434/api/generate';
const OLLAMA_MODEL:string = process.env.OLLAMA_MODEL ?? 'ali6parmak/hy-mt1.5:1.8b'; //this model is better at 03.2026
const TARGET_LANGUAGE: LanguageCode = (process.env.TARGET_LANGUAGE as LanguageCode) || "ru";

function docToString(doc: string | vscode.MarkdownString | vscode.MarkdownString | undefined): string {
    if (!doc) return '';
    if (typeof doc === 'string') return doc;
    const anyDoc = doc as any;
    if (typeof anyDoc.value === 'string') return anyDoc.value;
    if (typeof anyDoc.toString === 'function') return anyDoc.toString();
    return String(doc);
}

async function translateText(text: string) {
    if (!text) return text;
    if (translationCache.has(text)) return translationCache.get(text)!;

    try {
        //const prompt = `Translate the following documentation into Russian without changing code or identifiers:\n\n${text}`;
        const prompt = `Translate the following segment into {${TARGET_LANGUAGE}}, without additional explanation.\n\n${text}`;

        const res = await axios.post(
            OLLAMA_ENDPOINT,
            { model: OLLAMA_MODEL, prompt, max_tokens: 512, stream: false },
            { timeout: 12000 }
        );

        let translated = '';
        if (res.data) {
            if (res.data.response) translated = String(res.data.response);
            else if (res.data.completion) translated = String(res.data.completion);
            else if (res.data.choices && res.data.choices[0]) {
                translated = String(res.data.choices[0].text ?? res.data.choices[0].message?.content ?? '');
            } else {
                translated = String(res.data);
            }
        } else {
            translated = String(res);
        }

        translated = translated.trim();
        translationCache.set(text, translated);
        return translated;
    } catch (err) {
        console.error('Translation error:', err);
        return text;
    }
}

// Утилита: убирает пустые строки, нормализует, убирает дубликаты, возвращает массив уникальных блоков
function uniqueBlocksFromArray(blocks: string[]): string[] {
    const seen = new Set<string>();
    const res: string[] = [];
    for (let b of blocks) {
        b = b.trim();
        if (!b) continue;
        if (b.includes('**Перевод:**')) continue; // не берем уже переведённые блоки
        if (!seen.has(b)) {
            seen.add(b);
            res.push(b);
        }
    }
    return res;
}

// Выбирает основной doc-блок (самый длинный); возвращает {sigs, doc}
function splitSignatureAndDoc(blocks: string[]): { sigs: string[]; doc: string | null } {
    if (!blocks || blocks.length === 0) return { sigs: [], doc: null };
    if (blocks.length === 1) return { sigs: [], doc: blocks[0] };

    // основной документ — самый длинный блок
    let longest = blocks[0];
    for (const b of blocks) {
        if (b.length > longest.length) longest = b;
    }

    const sigs = blocks.filter(b => b !== longest);
    return { sigs, doc: longest };
}

export function activate(context: vscode.ExtensionContext) {
    const guard = { hover: false, completion: false, resolve: false };

    const languages = ['javascript', 'typescript', 'typescriptreact', 'javascriptreact'];

    // Hover: запрашиваем hover от language server, но фильтруем блоки,
    // убираем дубликаты и берём только основную документацию для перевода.
    const hoverProvider: vscode.HoverProvider = {
        async provideHover(document, position, token) {
            if (guard.hover) return;
            guard.hover = true;
            try {
                const hovs = await vscode.commands.executeCommand<vscode.Hover[]>(
                    'vscode.executeHoverProvider',
                    document.uri,
                    position
                );
                if (!hovs || hovs.length === 0) return;

                // Собираем все текстовые блоки из всех hover'ов
                const rawBlocks: string[] = [];
                for (const h of hovs) {
                    for (const c of h.contents) {
                        rawBlocks.push(docToString(c as any));
                    }
                }

                const blocks = uniqueBlocksFromArray(rawBlocks);
                if (blocks.length === 0) return;

                const { sigs, doc } = splitSignatureAndDoc(blocks);
                if (!doc) return;

                // Если уже где-то есть наш перевод — ничего не делаем
                if (doc.includes('**Перевод:**')) {
                    // вернуть первый hover как есть, чтобы не ломать UX
                    return hovs[0];
                }

                const translated = await translateText(doc);

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
            } finally {
                guard.hover = false;
            }
        }
    };

    // Completion: получаем items от executeCompletionItemProvider, но для каждого item
    // выбираем уникальные блоки документации, берём основной и переводим только его.
    const completionProvider: vscode.CompletionItemProvider = {
        async provideCompletionItems(document, position, token, context) {
            if (guard.completion) return undefined;
            guard.completion = true;
            try {
                const raw = await vscode.commands.executeCommand<any>(
                    'vscode.executeCompletionItemProvider',
                    document.uri,
                    position
                );
                if (!raw || !raw.items) return undefined;

                const items: vscode.CompletionItem[] = raw.items;

                for (const item of items) {
                    // Получаем текст и разбиваем на логические блоки по двойному переносу строки
                    const full = docToString(item.documentation).trim();
                    if (!full) continue;
                    if (full.includes('**Перевод:**')) continue;

                    // Разобьем на блоки: разделителем считаем два перевода строки
                    // это аккуратно отделит сигнатуры/код и параграфы
                    const candidateBlocks = full.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
                    const blocks = uniqueBlocksFromArray(candidateBlocks);
                    if (blocks.length === 0) continue;

                    const { sigs, doc } = splitSignatureAndDoc(blocks);
                    if (!doc) continue;

                    const translated = await translateText(doc);

                    const md = new vscode.MarkdownString();
                    if (sigs.length) //md.appendMarkdown(sigs.join('\n\n') + '\n\n');
                    
                    md.appendMarkdown('**Перевод:**\n' + translated);
                    md.isTrusted = false;

                    item.documentation = md;
                }

                return new vscode.CompletionList(items, raw.isIncomplete === true);
            } finally {
                guard.completion = false;
            }
        },

        async resolveCompletionItem(item: vscode.CompletionItem, token: vscode.CancellationToken) {
            if (guard.resolve) return item;
            guard.resolve = true;
            try {
                const full = docToString(item.documentation).trim();
                if (!full || full.includes('**Перевод:**')) return item;

                const candidateBlocks = full.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
                const blocks = uniqueBlocksFromArray(candidateBlocks);
                if (blocks.length === 0) return item;

                const { sigs, doc } = splitSignatureAndDoc(blocks);
                if (!doc) return item;

                const translated = await translateText(doc);

                const md = new vscode.MarkdownString();
                if (sigs.length) //md.appendMarkdown(sigs.join('\n\n') + '\n\n');
                
                md.appendMarkdown('**Перевод:**\n' + translated);
                md.isTrusted = false;

                item.documentation = md;
                return item;
            } finally {
                guard.resolve = false;
            }
        }
    };

    context.subscriptions.push(vscode.languages.registerHoverProvider(languages, hoverProvider));
    context.subscriptions.push(vscode.languages.registerCompletionItemProvider(languages, completionProvider));
}

export function deactivate() {}