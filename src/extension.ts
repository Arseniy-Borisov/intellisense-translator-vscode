// src/extension.ts
import * as vscode from 'vscode';
import axios from 'axios';

const translationCache = new Map<string, string>();


const SUPPORTED_LANGUAGES = [
  "Chinese","English","French","Portuguese","Spanish","Japanese","Turkish",
  "Russian","Arabic","Korean","Thai","Italian","German","Vietnamese","Malay",
  "Indonesian","Filipino","Hindi","Traditional Chinese","Polish","Czech","Dutch",
  "Khmer","Burmese","Persian","Gujarati","Urdu","Telugu","Marathi","Hebrew",
  "Bengali","Tamil","Ukrainian","Tibetan","Kazakh","Mongolian","Uyghur","Cantonese"
] as const;
// TypeScript автоматически создаёт тип SupportLanguages
type SupportLanguages = (typeof SUPPORTED_LANGUAGES)[number];
// Теперь массив и тип согласованы
const supported: SupportLanguages[] = [...SUPPORTED_LANGUAGES];



function docToString(doc: string | vscode.MarkdownString | vscode.MarkdownString | undefined): string {
    if (!doc) return '';
    if (typeof doc === 'string') return doc;
    const anyDoc = doc as any;
    if (typeof anyDoc.value === 'string') return anyDoc.value;
    if (typeof anyDoc.toString === 'function') return anyDoc.toString();
    return String(doc);
}

async function translateText(
  text: string,
  targetLanguage: SupportLanguages,
  endpoint: string,
  model: string
) {
  if (!text) return text;
  const cacheKey = `${text}||${targetLanguage}||${model}`;
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey)!;

  try {
    const prompt = `Translate the following segment into {${targetLanguage}}, without additional explanation.\n\n${text}`;

    const res = await axios.post(
      endpoint,
      { model, prompt, max_tokens: 512, stream: false },
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
    translationCache.set(cacheKey, translated);
    return translated;
  } catch (err) {
    console.error('Translation error:', err);
    return text;
  }
}

// Утилита: убирает пустые строки, нормализует, убирает дубликаты, возвращает массив уникальных блоков
function uniqueBlocksFromArray(blocks: string[], TARGET_LANGUAGE: SupportLanguages): string[] {
    const seen = new Set<string>();
    const res: string[] = [];
    for (let b of blocks) {
        b = b.trim();
        if (!b) continue;
        if (b.includes(`**${TARGET_LANGUAGE}:**`)) continue; // не берем уже переведённые блоки
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

  // --- Переменные конфигурации и функция для их обновления ---
  let OLLAMA_ENDPOINT: string;
  let OLLAMA_MODEL: string;
  let TARGET_LANGUAGE: SupportLanguages;

  const loadConfig = () => {
    const config = vscode.workspace.getConfiguration('intellisenseTranslator');

    OLLAMA_ENDPOINT = config.get<string>('ollamaEndpoint') ?? 'http://127.0.0.1:11434/api/generate';
    OLLAMA_MODEL = config.get<string>('model') ?? 'ali6parmak/hy-mt1.5:1.8b';
    const rawLang = config.get<string>('targetLanguage');
    

    TARGET_LANGUAGE = supported.includes(rawLang as SupportLanguages) ? (rawLang as SupportLanguages) : "Russian";

    console.log('Loaded config:', { OLLAMA_ENDPOINT, OLLAMA_MODEL, TARGET_LANGUAGE });
  };

  // Инициализация при запуске
  loadConfig();

  // --- Следим за изменениями конфигурации ---
  vscode.workspace.onDidChangeConfiguration(event => {
    if (
      event.affectsConfiguration('intellisenseTranslator.ollamaEndpoint') ||
      event.affectsConfiguration('intellisenseTranslator.model') ||
      event.affectsConfiguration('intellisenseTranslator.targetLanguage')
    ) {
      console.log('Config changed, reloading...');
      loadConfig();
      // Если нужно, здесь можно заново создать клиент OLLAMA или сбросить кэш
    }
  });

  // --- Hover Provider ---
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

        const rawBlocks: string[] = [];
        for (const h of hovs) {
          for (const c of h.contents) {
            rawBlocks.push(docToString(c as any));
          }
        }

        const blocks = uniqueBlocksFromArray(rawBlocks, TARGET_LANGUAGE);
        if (blocks.length === 0) return;

        const { sigs, doc } = splitSignatureAndDoc(blocks);
        if (!doc) return;
        if (doc.includes(`**${TARGET_LANGUAGE}:**`)) return hovs[0];

        const translated = await translateText(doc, TARGET_LANGUAGE, OLLAMA_ENDPOINT, OLLAMA_MODEL);

        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${TARGET_LANGUAGE}:**\n` + translated);
        md.isTrusted = false;

        return new vscode.Hover(md);
      } finally {
        guard.hover = false;
      }
    }
  };

  // --- Completion Provider ---
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
          const full = docToString(item.documentation).trim();
          if (!full || full.includes(`**${TARGET_LANGUAGE}:**`)) continue;

          const candidateBlocks = full.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
          const blocks = uniqueBlocksFromArray(candidateBlocks, TARGET_LANGUAGE);
          if (!blocks.length) continue;

          const { sigs, doc } = splitSignatureAndDoc(blocks);
          if (!doc) continue;

          const translated = await translateText(doc, TARGET_LANGUAGE, OLLAMA_ENDPOINT, OLLAMA_MODEL);

          const md = new vscode.MarkdownString();
          md.appendMarkdown(`**${TARGET_LANGUAGE}:**\n` + translated);
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
        if (!full || full.includes(`**${TARGET_LANGUAGE}:**`)) return item;

        const candidateBlocks = full.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
        const blocks = uniqueBlocksFromArray(candidateBlocks, TARGET_LANGUAGE);
        if (!blocks.length) return item;

        const { sigs, doc } = splitSignatureAndDoc(blocks);
        if (!doc) return item;

        const translated = await translateText(doc, TARGET_LANGUAGE, OLLAMA_ENDPOINT, OLLAMA_MODEL);

        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${TARGET_LANGUAGE}:**\n` + translated);
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