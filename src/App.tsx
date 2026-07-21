import React, { useState, useRef, useMemo } from 'react';
import { Camera, Download, FileJson, FileText, Image as ImageIcon, Loader2, Link2, Settings2, Globe, FileCode, UploadCloud, Edit3 } from 'lucide-react';
import { CaptureRequest } from './types.ts';
import { translations, Language } from './translations.ts';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

export type MarkdownTheme = 'github' | 'editorial' | 'nordic' | 'retro' | 'custom';

export function generateHtmlFromMarkdown(mdText: string, theme: MarkdownTheme, customTemplate?: string, enableToc: boolean = false): string {
  try {
    const rawHtml = marked.parse(mdText, { async: false }) as string;
    const cleanHtml = DOMPurify.sanitize(rawHtml);
    
    // Create a temporary document to hold and modify the markdown body
    const parser = new DOMParser();
    const tempDoc = parser.parseFromString(cleanHtml, 'text/html');
    
    if (enableToc) {
      const h2Elements = Array.from(tempDoc.querySelectorAll('h2'));
      if (h2Elements.length > 0) {
        const tocContainer = tempDoc.createElement('div');
        tocContainer.className = 'toc-container';
        // Theme-aware styles
        let tocBg = '#f8fafc';
        let tocBorder = '1px solid #e2e8f0';
        let tocTitleColor = '#1e293b';
        let tocTextColor = '#475569';
        let tocIndexColor = '#2563eb';
        
        if (theme === 'github') {
          tocBg = 'var(--color-canvas-subtle, #f6f8fa)';
          tocBorder = '1px solid var(--color-border-default, #d0d7de)';
          tocTitleColor = 'var(--color-fg-default, #24292f)';
          tocTextColor = 'var(--color-fg-muted, #57606a)';
          tocIndexColor = 'var(--color-accent-fg, #0969da)';
        } else if (theme === 'retro') {
          tocBg = '#121812';
          tocBorder = '1px solid #39ff14';
          tocTitleColor = '#39ff14';
          tocTextColor = '#a3a3a3';
          tocIndexColor = '#39ff14';
        } else if (theme === 'nordic') {
          tocBg = '#eceff4';
          tocBorder = '1px solid #d8dee9';
          tocTitleColor = '#2e3440';
          tocTextColor = '#4c566a';
          tocIndexColor = '#5e81ac';
        } else if (theme === 'editorial') {
          tocBg = '#faf9f6';
          tocBorder = '1px solid #e5e5e5';
          tocTitleColor = '#111111';
          tocTextColor = '#555555';
          tocIndexColor = '#8b0000';
        } else if (theme === 'custom') {
          tocBg = '#f8fafc';
          tocBorder = '1px solid #e2e8f0';
          tocTitleColor = '#1e293b';
          tocTextColor = '#475569';
          tocIndexColor = '#2563eb';
        }

        tocContainer.style.border = tocBorder;
        tocContainer.style.borderRadius = '8px';
        tocContainer.style.backgroundColor = tocBg;
        tocContainer.style.padding = '24px';
        tocContainer.style.marginBottom = '32px';
        
        const tocTitle = tempDoc.createElement('div');
        tocTitle.innerHTML = '<span>📄</span> 目录';
        tocTitle.style.fontSize = '1.125rem';
        tocTitle.style.fontWeight = '700';
        tocTitle.style.marginBottom = '20px';
        tocTitle.style.color = tocTitleColor;
        tocTitle.style.display = 'flex';
        tocTitle.style.alignItems = 'center';
        tocTitle.style.gap = '8px';
        tocContainer.appendChild(tocTitle);
        
        const tocGrid = tempDoc.createElement('div');
        tocGrid.style.display = 'grid';
        tocGrid.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
        tocGrid.style.gap = '20px 24px';
        
        h2Elements.forEach((h2, index) => {
          if (!h2.id) {
            h2.id = 'heading-' + index;
          }
          
          const indexNum = String(index + 1).padStart(2, '0');
          
          const tocLink = tempDoc.createElement('a');
          tocLink.href = '#' + h2.id;
          tocLink.style.textDecoration = 'none';
          tocLink.style.color = tocTextColor;
          tocLink.style.fontSize = '0.95rem';
          tocLink.style.display = 'flex';
          tocLink.style.alignItems = 'baseline';
          tocLink.style.gap = '10px';
          
          const indexSpan = tempDoc.createElement('span');
          indexSpan.textContent = indexNum;
          indexSpan.style.color = tocIndexColor;
          indexSpan.style.fontWeight = '600';
          indexSpan.style.fontSize = '1.05rem';
          indexSpan.style.flexShrink = '0';
          
          const textSpan = tempDoc.createElement('span');
          let cleanText = h2.textContent || '';
          // Remove leading numbers, dots, and spaces (e.g., "1. ", "1、", "01. ", "2 ", "2.")
          cleanText = cleanText.replace(/^\s*\d+[\.\/\-、\s]+/, '');
          textSpan.textContent = cleanText;
          textSpan.style.lineHeight = '1.5';
          
          tocLink.appendChild(indexSpan);
          tocLink.appendChild(textSpan);
          tocGrid.appendChild(tocLink);
        });
        
        tocContainer.appendChild(tocGrid);
        
        const firstH1 = tempDoc.querySelector('h1');
        if (firstH1) {
            firstH1.style.paddingBottom = '16px';
            firstH1.style.borderBottom = `3px solid ${tocIndexColor}`;
            firstH1.style.marginBottom = '32px';
            firstH1.insertAdjacentElement('afterend', tocContainer);
        } else {
            tempDoc.body.prepend(tocContainer);
        }
      }
    }
    
    const finalContentHtml = tempDoc.body.innerHTML;
    
    if (theme === 'custom' && customTemplate) {
      try {
        const customParser = new DOMParser();
        const doc = customParser.parseFromString(customTemplate, 'text/html');

        let targetContainer: Element | null = null;
        
        // Priority 1: Semantic tags
        targetContainer = doc.querySelector('article') || doc.querySelector('main');
        
        // Priority 2: Common IDs
        if (!targetContainer) {
          targetContainer = doc.getElementById('content') || doc.getElementById('main') || doc.getElementById('app') || doc.getElementById('article');
        }
        
        // Priority 3: Common class names
        if (!targetContainer) {
          targetContainer = doc.querySelector('.markdown-body') || 
                            doc.querySelector('.content') || 
                            doc.querySelector('.post-content') || 
                            doc.querySelector('.entry-content') ||
                            doc.querySelector('.article-content') ||
                            doc.querySelector('.article');
        }
        
        // Priority 4: Find parent containing standard content elements
        if (!targetContainer) {
          const contentTags = doc.querySelectorAll('h1, h2, h3, h4, p, li, blockquote');
          if (contentTags.length > 0) {
            const parentCountMap = new Map<Element, number>();
            contentTags.forEach(node => {
              const parent = node.parentElement;
              if (parent && parent !== doc.body && parent !== doc.documentElement) {
                parentCountMap.set(parent, (parentCountMap.get(parent) || 0) + 1);
              }
            });
            
            let bestParent: Element | null = null;
            let maxCount = 0;
            parentCountMap.forEach((count, parent) => {
              if (count > maxCount) {
                maxCount = count;
                bestParent = parent;
              }
            });
            targetContainer = bestParent;
          }
        }
        
        // Priority 5: Fallback to body
        if (!targetContainer) {
          targetContainer = doc.body;
        }

        if (targetContainer) {
          targetContainer.innerHTML = finalContentHtml;
        } else {
          doc.body.innerHTML = finalContentHtml;
        }

        // Keep or dynamically inject code block styling to match the theme color
        const htmlLower = customTemplate.toLowerCase();

        // 1. Resolve any relative CSS/JS paths first, replacing them with standard CDN links so they load correctly inside Sandbox Iframe
        const links = doc.querySelectorAll('link[rel="stylesheet"]');
        links.forEach(link => {
          const href = link.getAttribute('href') || '';
          if (href && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('//')) {
            const hrefLower = href.toLowerCase();
            if (hrefLower.includes('prism')) {
              link.setAttribute('href', 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css');
            } else if (hrefLower.includes('github') || hrefLower.includes('vs2015') || hrefLower.includes('dracula') || hrefLower.includes('monokai') || hrefLower.includes('highlight') || hrefLower.includes('hljs')) {
              link.setAttribute('href', 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/vs2015.min.css');
            }
          }
        });

        const scripts = doc.querySelectorAll('script');
        scripts.forEach(script => {
          const src = script.getAttribute('src') || '';
          if (src && !src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('//')) {
            const srcLower = src.toLowerCase();
            if (srcLower.includes('prism')) {
              script.setAttribute('src', 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js');
            } else if (srcLower.includes('highlight') || srcLower.includes('hljs')) {
              script.setAttribute('src', 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js');
            }
          }
        });

        // 2. Detect highlighting engine in the template
        const usesPrism = htmlLower.includes('prism.css') || htmlLower.includes('prism-tomorrow') || htmlLower.includes('prism-okaidia') || htmlLower.includes('prism.js') || htmlLower.includes('prism') || htmlLower.includes('.token ') || htmlLower.includes('token"');
        const usesHljs = htmlLower.includes('highlight.js') || htmlLower.includes('hljs') || htmlLower.includes('.hljs-keyword') || htmlLower.includes('hljs-');
        const hasSyntaxTheme = htmlLower.includes('styles/github') || htmlLower.includes('styles/vs2015') || htmlLower.includes('styles/atom-one') || htmlLower.includes('styles/tokyo-night') || htmlLower.includes('styles/dracula') || htmlLower.includes('themes/prism');

        // 3. Check code block background style in template
        let isDarkCodeBlock = true; // default to true as templates almost universally use dark code blocks
        const preStyleMatch = customTemplate.match(/pre\s*{([^}]+)}/i);
        if (preStyleMatch && preStyleMatch[1]) {
          const cssRules = preStyleMatch[1].toLowerCase();
          if (cssRules.includes('background') || cssRules.includes('background-color')) {
            const isLightBg = cssRules.includes('#fff') || cssRules.includes('white') || cssRules.includes('#f3') || cssRules.includes('#f4') || cssRules.includes('#f5') || cssRules.includes('#f6') || cssRules.includes('255, 255') || cssRules.includes('rgba(255');
            if (isLightBg) {
              isDarkCodeBlock = false;
            }
          }
        }

        // 4. Inject theme fallbacks if they are missing or unable to load
        if (!hasSyntaxTheme) {
          if (usesPrism) {
            const themeLink = doc.createElement('link');
            themeLink.rel = 'stylesheet';
            themeLink.href = isDarkCodeBlock
              ? 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-okaidia.min.css'
              : 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css';
            doc.head.appendChild(themeLink);
          } else {
            // Default to Highlight.js VS 2015 theme (EXACTLY matching elegant dark theme in screenshot)
            const themeLink = doc.createElement('link');
            themeLink.rel = 'stylesheet';
            themeLink.href = isDarkCodeBlock 
              ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/vs2015.min.css'
              : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
            doc.head.appendChild(themeLink);
          }
        }

        // 5. Inject dependencies if not imported absolutely in the template
        const hasPrismScript = htmlLower.includes('prism.js') || htmlLower.includes('prism.min.js') || htmlLower.includes('cdnjs.cloudflare.com/ajax/libs/prism');
        const hasHljsScript = htmlLower.includes('highlight.js') || htmlLower.includes('highlight.min.js') || htmlLower.includes('cdnjs.cloudflare.com/ajax/libs/highlight.js');

        if (usesPrism && !hasPrismScript) {
          const prismScript = doc.createElement('script');
          prismScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js';
          doc.body.appendChild(prismScript);

          const prismAutoloader = doc.createElement('script');
          prismAutoloader.src = 'https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js';
          doc.body.appendChild(prismAutoloader);
        }

        if (!usesPrism && !hasHljsScript) {
          const hljsScript = doc.createElement('script');
          hljsScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js';
          doc.body.appendChild(hljsScript);
        }

        // 6. Style Fallback wrapper to guarantee a beautiful container background, rounded corners, shadows, and spacing.
        const styleFallback = doc.createElement('style');
        styleFallback.textContent = `
          pre {
            background-color: ${isDarkCodeBlock ? '#1e1e1e' : '#f6f8fa'} !important;
            color: ${isDarkCodeBlock ? '#d4d4d4' : '#24292e'} !important;
            padding: 1.25rem !important;
            border-radius: 8px !important;
            overflow-x: auto !important;
            font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', 'Fira Code', 'JetBrains Mono', monospace !important;
            font-size: 0.875rem !important;
            line-height: 1.5 !important;
            border: 1px solid ${isDarkCodeBlock ? 'rgba(255, 255, 255, 0.08)' : 'rgba(27, 31, 35, 0.15)'} !important;
            box-shadow: ${isDarkCodeBlock ? '0 4px 12px rgba(0, 0, 0, 0.15)' : '0 2px 8px rgba(0, 0, 0, 0.05)'} !important;
            margin: 1.5rem 0 !important;
          }
          pre code {
            font-family: inherit !important;
            font-size: inherit !important;
            background: transparent !important;
            padding: 0 !important;
            border-radius: 0 !important;
          }
          :not(pre) > code {
            background-color: ${isDarkCodeBlock ? 'rgba(255, 255, 255, 0.1)' : 'rgba(27, 31, 35, 0.05)'} !important;
            color: ${isDarkCodeBlock ? '#ef4444' : '#db2777'} !important;
            padding: 0.2rem 0.4rem !important;
            border-radius: 4px !important;
            font-size: 0.85em !important;
          }
          hr {
            border: 0;
            border-top: 1px solid rgba(0, 0, 0, 0.1);
            margin: 2rem 0;
          }
          @media (prefers-color-scheme: dark) {
            hr { border-top-color: rgba(255, 255, 255, 0.1); }
          }
        `;
        doc.head.appendChild(styleFallback);

        // 7. Inject execution scripts which trigger highlighters dynamically at multiples ticks
        const scriptRunner = doc.createElement('script');
        scriptRunner.textContent = `
          (function() {
            function runHighlight() {
              if (typeof Prism !== 'undefined') {
                try { Prism.highlightAll(); } catch (e) {}
              }
              if (typeof hljs !== 'undefined') {
                try { hljs.highlightAll(); } catch (e) {}
              }
            }
            if (document.readyState === 'loading') {
              document.addEventListener('DOMContentLoaded', runHighlight);
            } else {
              runHighlight();
            }
            setTimeout(runHighlight, 30);
            setTimeout(runHighlight, 150);
            setTimeout(runHighlight, 600);
          })();
        `;
        doc.body.appendChild(scriptRunner);

        return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
      } catch (err) {
        console.error('Failed to parse and merge custom template:', err);
      }
    }
    
    let styleContent = '';
    let bodyClass = 'markdown-body';
    let headInject = '';

    if (theme === 'github') {
      headInject = `
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown.min.css">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css">
      `;
      styleContent = `
        body { margin: 0; background-color: var(--color-canvas-default, #fff); }
        .markdown-body { box-sizing: border-box; min-width: 200px; max-width: 980px; margin: 0 auto; padding: 45px; }
        @media (max-width: 767px) { .markdown-body { padding: 15px; } }
      `;
    } else if (theme === 'editorial') {
      headInject = `
        <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Playfair+Display:ital,wght@0,600;0,700;1,400&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-gist.min.css">
      `;
      styleContent = `
        body {
          font-family: 'Lora', Georgia, serif;
          color: #2d2315;
          background-color: #fdfbf7;
          line-height: 1.8;
          margin: 0;
          padding: 0;
        }
        .markdown-body {
          box-sizing: border-box;
          max-width: 800px;
          margin: 0 auto;
          padding: 60px 40px;
        }
        @media (max-width: 767px) { .markdown-body { padding: 30px 15px; } }
        h1, h2, h3, h4, h5, h6 {
          font-family: 'Playfair Display', serif;
          color: #111;
          font-weight: 700;
          margin-top: 1.6em;
          margin-bottom: 0.6em;
          line-height: 1.3;
        }
        h1 { font-size: 2.4em; border-bottom: 1px solid #e1dbcf; padding-bottom: 0.3em; }
        h2 { font-size: 1.8em; margin-top: 1.4em; border-bottom: 1px solid rgba(225,219,207,0.5); padding-bottom: 0.2em; }
        h3 { font-size: 1.35em; }
        p { margin: 1.25em 0; font-size: 1.1rem; }
        blockquote {
          border-left: 4px solid #8c7b60;
          padding-left: 20px;
          margin: 24px 0;
          font-style: italic;
          color: #5c4e3b;
          background-color: #f5f0e6;
          padding: 12px 24px;
          border-radius: 4px;
        }
        code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          background: #f1ebd8;
          padding: 3px 6px;
          border-radius: 4px;
          font-size: 0.9em;
          color: #8c2d19;
        }
        pre {
          background: #f5eedc;
          padding: 20px;
          border-radius: 8px;
          overflow-x: auto;
          border: 1px solid #e1dbcf;
          margin: 24px 0;
        }
        pre code { background: none; padding: 0; color: inherit; font-size: 0.95em; }
        hr {
          border: 0;
          border-top: 1px solid #e1dbcf;
          margin: 40px 0;
        }
        img { max-width: 100%; height: auto; border-radius: 4px; border: 1px solid #e1dbcf; }
        table { width: 100%; border-collapse: collapse; margin: 24px 0; }
        th, td { border: 1px solid #e1dbcf; padding: 12px; text-align: left; }
        th { background-color: #f5eedc; font-weight: 600; }
        ul, ol { padding-left: 24px; margin: 1.25em 0; }
        li { margin-bottom: 0.5em; }
      `;
    } else if (theme === 'nordic') {
      headInject = `
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/tokyo-night-dark.min.css">
      `;
      styleContent = `
        body {
          font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
          color: #2d3748;
          background-color: #fafbfd;
          line-height: 1.65;
          margin: 0;
          padding: 0;
        }
        .markdown-body {
          box-sizing: border-box;
          max-width: 780px;
          margin: 0 auto;
          padding: 55px 35px;
        }
        @media (max-width: 767px) { .markdown-body { padding: 25px 15px; } }
        h1, h2, h3, h4, h5, h6 {
          color: #1a202c;
          font-weight: 700;
          letter-spacing: -0.025em;
          margin-top: 1.8em;
          margin-bottom: 0.6em;
          line-height: 1.35;
        }
        h1 { font-size: 2.2em; margin-bottom: 0.8em; }
        h2 { font-size: 1.6em; margin-top: 1.6em; border-bottom: 1.5px solid #edf2f7; padding-bottom: 0.4em; }
        h3 { font-size: 1.25em; }
        p { margin: 1.2em 0; font-size: 1rem; color: #4a5568; }
        blockquote {
          background-color: #f7fafc;
          border-left: 4px solid #cbd5e0;
          padding: 16px 24px;
          margin: 24px 0;
          color: #4a5568;
          border-radius: 0 8px 8px 0;
        }
        code {
          font-family: 'JetBrains Mono', monospace;
          background-color: #edf2f7;
          color: #dd6b20;
          padding: 2.5px 5px;
          border-radius: 4px;
          font-size: 0.9em;
        }
        pre {
          background: #1a202c;
          color: #f7fafc;
          padding: 20px;
          border-radius: 8px;
          overflow-x: auto;
          margin: 24px 0;
        }
        pre code { background: none; padding: 0; color: inherit; font-size: 0.9em; }
        hr {
          border: 0;
          border-top: 2px solid #edf2f7;
          margin: 36px 0;
        }
        img { max-width: 100%; height: auto; border-radius: 6px; }
        table { width: 100%; border-collapse: collapse; margin: 24px 0; }
        th, td { border: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; }
        th { background-color: #f7fafc; font-weight: 600; color: #4a5568; }
        ul, ol { padding-left: 20px; margin: 1.2em 0; }
        li { margin-bottom: 0.4em; color: #4a5568; }
      `;
    } else if (theme === 'retro') {
      headInject = `
        <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;700&display=swap" rel="stylesheet">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/monokai-sublime.min.css">
      `;
      styleContent = `
        body {
          font-family: 'Fira Code', 'Courier New', monospace;
          color: #39ff14;
          background-color: #0b0f0b;
          line-height: 1.6;
          margin: 0;
          padding: 0;
        }
        .markdown-body {
          box-sizing: border-box;
          max-width: 840px;
          margin: 0 auto;
          padding: 40px;
        }
        @media (max-width: 767px) { .markdown-body { padding: 20px 15px; } }
        h1, h2, h3, h4, h5, h6 {
          color: #39ff14;
          font-weight: bold;
          margin-top: 1.8em;
          margin-bottom: 0.8em;
          border-bottom: 1px dashed #39ff14;
          padding-bottom: 6px;
        }
        h1 { font-size: 1.8em; text-transform: uppercase; }
        h2 { font-size: 1.4em; }
        h3 { font-size: 1.15em; }
        p { margin: 1.2em 0; font-size: 0.95rem; }
        blockquote {
          border-left: 3px double #39ff14;
          padding-left: 20px;
          margin: 20px 0;
          color: #39ff14;
          opacity: 0.85;
          background-color: rgba(57, 255, 20, 0.05);
          padding: 10px 20px;
        }
        code {
          background-color: rgba(57, 255, 20, 0.15);
          color: #fff;
          padding: 2px 4px;
          border-radius: 2px;
          font-size: 0.9em;
        }
        pre {
          border: 1px solid #39ff14;
          padding: 20px;
          background-color: #121812;
          overflow-x: auto;
          margin: 24px 0;
          box-shadow: 0 0 10px rgba(57, 255, 20, 0.1);
        }
        pre code { background: none; padding: 0; color: #39ff14; }
        hr {
          border: 0;
          border-top: 1px dashed #39ff14;
          margin: 36px 0;
        }
        img { max-width: 100%; height: auto; border: 1px solid #39ff14; filter: sepia(1) hue-rotate(80deg) saturate(1.5); }
        table { width: 100%; border-collapse: collapse; margin: 24px 0; }
        th, td { border: 1px solid #39ff14; padding: 10px; text-align: left; }
        th { background-color: rgba(57, 255, 20, 0.1); font-weight: bold; }
        ul, ol { padding-left: 20px; margin: 1.2em 0; }
        li { margin-bottom: 0.4em; }
      `;
    }

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    ${headInject}
    <style>
        ${styleContent}
    </style>
</head>
<body>
    <article class="${bodyClass}">
        ${finalContentHtml}
    </article>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
    <script>
      document.addEventListener('DOMContentLoaded', (event) => {
        if (typeof hljs !== 'undefined') {
          hljs.highlightAll();
        }
      });
      setTimeout(() => {
        if (typeof hljs !== 'undefined') {
          hljs.highlightAll();
        }
      }, 30);
    </script>
</body>
</html>`;
  } catch (err) {
    console.error(err);
    return '';
  }
}

export default function App() {
  const [lang, setLang] = useState<Language>('zh');
  const t = translations[lang];

  const [inputMode, setInputMode] = useState<'url' | 'html' | 'md'>('url');
  const [htmlFileName, setHtmlFileName] = useState<string | null>(null);
  const [mdFileName, setMdFileName] = useState<string | null>(null);
  const [mdContent, setMdContent] = useState<string>('');
  const [mdTheme, setMdTheme] = useState<MarkdownTheme>('github');
  const [mdEnableToc, setMdEnableToc] = useState<boolean>(true);
  const [customHtmlTemplate, setCustomHtmlTemplate] = useState<string>('');
  const [customTemplateName, setCustomTemplateName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mdFileInputRef = useRef<HTMLInputElement>(null);
  const customTemplateInputRef = useRef<HTMLInputElement>(null);

  const [request, setRequest] = useState<CaptureRequest>({
    url: '',
    htmlContent: '',
    format: 'png',
    fullPage: true,
    width: 1920,
    height: 1080,
    deviceScaleFactor: 2,
    pdfMargin: '0px',
    splitLongImage: false,
    splitMaxHeight: 12000,
  });
  
  const [captureType, setCaptureType] = useState<'full' | 'visible' | 'selector'>('full');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultType, setResultType] = useState<'image' | 'pdf' | 'zip' | null>(null);
  const [splitPartCount, setSplitPartCount] = useState<number | null>(null);

  const livePreviewHtml = useMemo(() => {
    if (inputMode === 'url') return '';
    if (inputMode === 'html') return request.htmlContent;
    if (inputMode === 'md' && mdContent) {
      return generateHtmlFromMarkdown(mdContent, mdTheme, customHtmlTemplate, mdEnableToc);
    }
    return '';
  }, [inputMode, request.htmlContent, mdContent, mdTheme, customHtmlTemplate]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (inputMode === 'html') {
        handleFileSelect(e.dataTransfer.files[0]);
      } else if (inputMode === 'md') {
        handleMdFileSelect(e.dataTransfer.files[0]);
      }
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const handleMdFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleMdFileSelect(e.target.files[0]);
    }
  };

  const handleCustomTemplateFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleCustomTemplateSelect(e.target.files[0]);
    }
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith('.html') && file.type !== 'text/html') {
      setError(t.invalidHtml);
      return;
    }
    setError(null);
    setHtmlFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setRequest(prev => ({ ...prev, htmlContent: content }));
    };
    reader.readAsText(file);
  };

  const handleMdFileSelect = (file: File) => {
    if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown') && file.type !== 'text/markdown') {
      // Allow it anyway for plain text, but might warn. Just read it as text.
    }
    setError(null);
    setMdFileName(file.name);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setMdContent(content);
    };
    reader.readAsText(file);
  };

  const handleCustomTemplateSelect = (file: File) => {
    if (!file.name.endsWith('.html') && file.type !== 'text/html') {
      setError(t.invalidHtml);
      return;
    }
    setError(null);
    setCustomTemplateName(file.name);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setCustomHtmlTemplate(content);
      setMdTheme('custom');
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMode === 'url' && !request.url) return;
    if (inputMode === 'html' && !request.htmlContent) return;
    if (inputMode === 'md' && !mdContent) return;

    setLoading(true);
    setError(null);
    setResultUrl(null);
    setResultType(null);
    setSplitPartCount(null);
    
    let submitUrl = request.url;
    if (inputMode === 'url' && submitUrl && !submitUrl.startsWith('http://') && !submitUrl.startsWith('https://')) {
        submitUrl = 'https://' + submitUrl;
    }

    let finalHtmlContent = inputMode === 'html' ? request.htmlContent : undefined;
    
    if (inputMode === 'md') {
      try {
        finalHtmlContent = generateHtmlFromMarkdown(mdContent, mdTheme, customHtmlTemplate, mdEnableToc);
      } catch (err) {
        setError('Failed to parse Markdown.');
        setLoading(false);
        return;
      }
    }

    const payload = {
      ...request,
      url: inputMode === 'url' ? submitUrl : undefined,
      htmlContent: finalHtmlContent,
      fullPage: captureType === 'full',
      selector: captureType === 'selector' ? request.selector : undefined,
    };

    try {
      const response = await fetch('/api/capture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.error || `Server error: ${response.status}`);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const contentType = response.headers.get('Content-Type') || blob.type;
      const isZip = contentType.includes('application/zip') || response.headers.get('X-Capture-Strategy') === 'split-smart';
      const partCount = Number(response.headers.get('X-Split-Part-Count'));
      setResultUrl(objectUrl);
      setResultType(isZip ? 'zip' : request.format === 'pdf' ? 'pdf' : 'image');
      setSplitPartCount(Number.isFinite(partCount) && partCount > 0 ? partCount : null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement('a');
    a.href = resultUrl;
    const extension = resultType === 'zip' ? 'zip' : request.format;
    a.download = `screenshot-${new Date().getTime()}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans p-6 md:p-12 relative">
      {/* Language Switcher */}
      <div className="absolute top-4 right-4 md:top-8 md:right-8 flex bg-white rounded-md shadow-sm border border-gray-200 p-1">
        <button 
          onClick={() => setLang('zh')}
          className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${lang === 'zh' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
        >
          中文
        </button>
        <button 
          onClick={() => setLang('en')}
          className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${lang === 'en' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
        >
          EN
        </button>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 mt-8 md:mt-0">
        
        {/* Left Column: Form */}
        <div className="lg:col-span-5 space-y-6">
          <header className="mb-8">
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900 flex items-center gap-3">
              <Camera className="w-8 h-8 text-blue-600" />
              {t.title}
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              {t.subtitle}
            </p>
          </header>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <form onSubmit={handleSubmit} className="space-y-5">
              
              {/* Input Mode Selector */}
              <div className="flex p-1 bg-gray-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => setInputMode('url')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                    inputMode === 'url' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  {t.liveUrl}
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('html')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                    inputMode === 'html' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <FileCode className="w-4 h-4" />
                  {t.localHtml}
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode('md')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 text-sm font-medium rounded-md transition-colors ${
                    inputMode === 'md' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Edit3 className="w-4 h-4" />
                  {t.markdown}
                </button>
              </div>

              {/* Input Area */}
              {inputMode === 'url' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t.websiteUrl}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Link2 className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      required={inputMode === 'url'}
                      placeholder="example.com"
                      value={request.url}
                      onChange={(e) => setRequest({ ...request, url: e.target.value })}
                      className="block w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm outline-none transition-shadow"
                    />
                  </div>
                </div>
              )}
              
              {inputMode === 'html' && (
                <div>
                   <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t.uploadHtml}
                  </label>
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                      htmlFileName ? 'border-blue-300 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
                    }`}
                  >
                    <input 
                      type="file" 
                      accept=".html,text/html" 
                      className="hidden" 
                      ref={fileInputRef}
                      onChange={handleFileInput}
                    />
                    <UploadCloud className={`w-8 h-8 mx-auto mb-2 ${htmlFileName ? 'text-blue-500' : 'text-gray-400'}`} />
                    {htmlFileName ? (
                      <p className="text-sm font-medium text-blue-700">{htmlFileName}</p>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-gray-900">{t.clickToUpload}</p>
                        <p className="text-xs text-gray-500 mt-1">{t.singleHtmlFile}</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {inputMode === 'md' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {/* @ts-ignore */}
                    {t.uploadMarkdown || 'Upload or Paste Markdown'}
                  </label>
                  
                  <div className="space-y-3">
                    <textarea
                      placeholder="# Markdown Title&#10;&#10;Write some markdown here or upload a file below..."
                      value={mdContent}
                      onChange={(e) => setMdContent(e.target.value)}
                      className="block w-full p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm outline-none font-mono min-h-[120px] resize-y"
                    />
                    <div 
                      onClick={() => mdFileInputRef.current?.click()}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                        mdFileName ? 'border-blue-300 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
                      }`}
                    >
                      <input 
                        type="file" 
                        accept=".md,.markdown,text/markdown" 
                        className="hidden" 
                        ref={mdFileInputRef}
                        onChange={handleMdFileInput}
                      />
                      <FileText className={`w-6 h-6 mx-auto mb-1 ${mdFileName ? 'text-blue-500' : 'text-gray-400'}`} />
                      {mdFileName ? (
                        <p className="text-sm font-medium text-blue-700">{mdFileName}</p>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-gray-900">
                            {/* @ts-ignore */}
                            {t.clickToUpload}
                          </p>
                          <p className="text-xs text-gray-500">
                            {/* @ts-ignore */}
                            {t.singleMdFile || 'Supports .md file'}
                          </p>
                        </>
                      )}
                    </div>

                    {/* Markdown HTML Styling Theme Selector */}
                    <div className="pt-3 border-t border-gray-100 space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          {/* @ts-ignore */}
                          {t.selectTheme || 'Select HTML Theme'}
                        </label>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {(['github', 'editorial', 'nordic', 'retro'] as const).map((thm) => (
                            <button
                              key={thm}
                              type="button"
                              onClick={() => setMdTheme(thm)}
                              className={`py-1.5 px-2 rounded-md border text-xs font-medium text-center transition-all cursor-pointer ${
                                mdTheme === thm
                                  ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold shadow-sm'
                                  : 'border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                              }`}
                            >
                              {/* @ts-ignore */}
                              {t[`theme${thm.charAt(0).toUpperCase() + thm.slice(1)}`] || thm}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Custom Style Template Upload Card */}
                      <div className="border border-dashed border-gray-200 rounded-xl p-3 bg-gray-50/50 space-y-2">
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            onClick={() => {
                              if (customHtmlTemplate) {
                                setMdTheme('custom');
                              } else {
                                customTemplateInputRef.current?.click();
                              }
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer ${
                              mdTheme === 'custom'
                                ? 'border-blue-600 bg-blue-50 text-blue-700'
                                : 'border-gray-200 bg-white hover:bg-gray-50 text-gray-700'
                            }`}
                          >
                            <div className={`w-2 h-2 rounded-full ${mdTheme === 'custom' ? 'bg-blue-600' : 'bg-gray-300'}`} />
                            {/* @ts-ignore */}
                            {t.themeCustom || 'Custom Style Theme'}
                          </button>
                          <input
                            type="file"
                            accept=".html,text/html"
                            className="hidden"
                            ref={customTemplateInputRef}
                            onChange={handleCustomTemplateFileInput}
                          />
                          <button
                            type="button"
                            onClick={() => customTemplateInputRef.current?.click()}
                            className="text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                          >
                            {/* @ts-ignore */}
                            {t.uploadCustomTemplate || 'Upload style reference'}
                          </button>
                        </div>

                        {customTemplateName ? (
                          <div className="flex items-center justify-between text-xs bg-white border border-gray-100 rounded-lg p-2 shadow-xs mt-2">
                            <div className="flex items-center gap-1.5 text-gray-600 truncate mr-2">
                              <FileCode className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              <span className="font-medium text-gray-700 truncate">{customTemplateName}</span>
                            </div>
                            <span className="text-[10px] bg-green-50 text-green-700 border border-green-200/55 rounded-full px-2 py-0.5 font-medium shrink-0">
                              {/* @ts-ignore */}
                              {t.customTemplateAttached || 'Loaded'}
                            </span>
                          </div>
                        ) : (
                          <p className="text-[11px] text-gray-400 mt-2">
                            {/* @ts-ignore */}
                            {t.noCustomTemplateAttached || 'Upload an HTML sample to copy its style.'}
                          </p>
                        )}
                      </div>

                      {/* TOC Toggle */}
                      <div className="flex items-center pt-2 border-t border-gray-100">
                        <input
                          id="markdown-toc"
                          type="checkbox"
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                          checked={mdEnableToc}
                          onChange={(e) => setMdEnableToc(e.target.checked)}
                        />
                        <label htmlFor="markdown-toc" className="ml-2 block text-sm text-gray-900 cursor-pointer">
                          在顶部自动生成目录 (Generate Table of Contents)
                        </label>
                      </div>
                    </div>

                    {/* Convert and Export Panel */}
                    <div className="pt-3 border-t border-gray-100 bg-gray-100/50 p-3 rounded-xl border border-gray-200/50 space-y-2 mt-2">
                      <div className="flex items-start gap-2 text-xs text-gray-500 leading-relaxed">
                        <FileCode className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                        <span>{/* @ts-ignore */}{t.exportHtmlDesc}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          disabled={!mdContent.trim() || (mdTheme === 'custom' && !customHtmlTemplate)}
                          onClick={() => {
                            const html = generateHtmlFromMarkdown(mdContent, mdTheme, customHtmlTemplate, mdEnableToc);
                            const blob = new Blob([html], { type: 'text/html' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `converted-${mdTheme}-${new Date().getTime()}.html`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                          }}
                          className="flex items-center justify-center gap-1.5 py-2 px-3 border border-gray-200 text-xs font-medium rounded-lg bg-white hover:bg-gray-50 text-gray-700 shadow-sm transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {/* @ts-ignore */}
                          {t.downloadCode || 'Download HTML'}
                        </button>
                        <button
                          type="button"
                          disabled={!mdContent.trim() || (mdTheme === 'custom' && !customHtmlTemplate)}
                          onClick={() => {
                            const html = generateHtmlFromMarkdown(mdContent, mdTheme, customHtmlTemplate, mdEnableToc);
                            setRequest(prev => ({ ...prev, htmlContent: html }));
                            setHtmlFileName(`converted-${mdTheme}.html`);
                            setInputMode('html');
                          }}
                          className="flex items-center justify-center gap-1.5 py-2 px-3 border border-transparent text-xs font-semibold rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <FileCode className="w-3.5 h-3.5" />
                          {/* @ts-ignore */}
                          {t.loadIntoHtmlTab || 'Load into HTML Editor'}
                        </button>
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {/* Format Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t.outputFormat}</label>
                <div className="grid grid-cols-3 gap-3">
                  {(['png', 'jpeg', 'pdf'] as const).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setRequest({ ...request, format: fmt })}
                      className={`flex flex-col items-center justify-center p-3 rounded-lg border text-sm uppercase tracking-wide font-medium transition-colors ${
                        request.format === fmt
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {fmt === 'pdf' ? <FileText className="w-5 h-5 mb-1" /> : <ImageIcon className="w-5 h-5 mb-1" />}
                      {fmt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Capture Type */}
              {request.format !== 'pdf' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t.captureRegion}</label>
                  <div className="space-y-2">
                    <label className="flex items-start p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="captureType"
                        checked={captureType === 'full'}
                        onChange={() => setCaptureType('full')}
                        className="w-4 h-4 mt-0.5 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <div className="ml-3 flex flex-col">
                        <span className="text-sm font-medium">{t.fullPage}</span>
                        <span className="text-xs text-gray-500 mt-0.5">{t.fullPageDesc}</span>
                      </div>
                    </label>
                    <label className="flex items-start p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="captureType"
                        checked={captureType === 'visible'}
                        onChange={() => setCaptureType('visible')}
                        className="w-4 h-4 mt-0.5 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <div className="ml-3 flex flex-col">
                        <span className="text-sm font-medium">{t.visibleViewport}</span>
                        <span className="text-xs text-gray-500 mt-0.5">{t.visibleViewportDesc}</span>
                      </div>
                    </label>
                    <label className="flex items-start p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                      <input
                        type="radio"
                        name="captureType"
                        checked={captureType === 'selector'}
                        onChange={() => setCaptureType('selector')}
                        className="w-4 h-4 mt-0.5 text-blue-600 focus:ring-blue-500 border-gray-300"
                      />
                      <div className="ml-3 flex flex-col w-full">
                        <span className="text-sm font-medium">{t.customSelector}</span>
                        <span className="text-xs text-gray-500 mt-0.5 mb-1">{t.customSelectorDesc}</span>
                        {captureType === 'selector' && (
                          <input
                            type="text"
                            placeholder=".article-content, #main-header"
                            value={request.selector || ''}
                            onChange={(e) => setRequest({ ...request, selector: e.target.value })}
                            className="mt-2 block w-full px-3 py-2 border border-gray-200 rounded-md sm:text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* PDF Advanced Settings */}
              {request.format === 'pdf' && (
                <div className="space-y-4">
                  {/* PDF Margin Settings */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t.pdfMargin}</label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { value: '0px', label: t.pdfMarginNone },
                        { value: '20px', label: t.pdfMarginStandard },
                        { value: '40px', label: t.pdfMarginLarge }
                      ].map((margin) => (
                        <button
                          key={margin.value}
                          type="button"
                          onClick={() => setRequest({ ...request, pdfMargin: margin.value })}
                          className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                            request.pdfMargin === margin.value
                              ? 'border-blue-600 bg-blue-50 text-blue-700'
                              : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {margin.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t.pdfBreakAvoidSelectors}</label>
                    <input
                      type="text"
                      placeholder=".card, .article-section"
                      value={request.pdfBreakAvoidSelectors || ''}
                      onChange={(e) => setRequest({ ...request, pdfBreakAvoidSelectors: e.target.value })}
                      className="block w-full px-3 py-2 border border-gray-200 rounded-md sm:text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="text-xs text-gray-400 mt-1">{t.pdfBreakAvoidSelectorsDesc}</p>
                  </div>
                </div>
              )}

              {/* Viewport Settings */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <Settings2 className="w-4 h-4" /> {t.viewportResolution}
                </label>
                <div className="flex gap-4">
                  <div className="flex-1 border border-gray-200 rounded-md flex items-center">
                    <span className="pl-3 text-gray-500 text-sm">{t.width}</span>
                    <input
                      type="number"
                      value={request.width}
                      onChange={(e) => setRequest({ ...request, width: parseInt(e.target.value) || 1920 })}
                      className="block w-full px-3 py-2 bg-transparent sm:text-sm outline-none"
                    />
                  </div>
                  <div className="flex-1 border border-gray-200 rounded-md flex items-center">
                    <span className="pl-3 text-gray-500 text-sm">{t.height}</span>
                    <input
                      type="number"
                      value={request.height}
                      onChange={(e) => setRequest({ ...request, height: parseInt(e.target.value) || 1080 })}
                      className="block w-full px-3 py-2 bg-transparent sm:text-sm outline-none"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">{t.simulatedBrowserSize}</p>
              </div>

              {/* Image Quality */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t.imageQuality}</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 1, label: t.qualityStandard },
                    { value: 2, label: t.qualityHigh },
                    { value: 3, label: t.qualityUltra }
                  ].map((level) => (
                    <button
                      key={level.value}
                      type="button"
                      onClick={() => setRequest({ ...request, deviceScaleFactor: level.value })}
                      className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        request.deviceScaleFactor === level.value
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </div>

              {request.format !== 'pdf' && captureType !== 'visible' && (
                <div className="border border-gray-200 rounded-xl p-3 bg-gray-50/60 space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!request.splitLongImage}
                      onChange={(e) => setRequest({ ...request, splitLongImage: e.target.checked })}
                      className="w-4 h-4 mt-0.5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="flex-1">
                      <span className="block text-sm font-medium text-gray-900">{t.smartSplit}</span>
                      <span className="block text-xs text-gray-500 mt-0.5 leading-relaxed">{t.smartSplitDesc}</span>
                    </span>
                  </label>

                  {request.splitLongImage && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{t.splitMaxHeight}</label>
                      <div className="border border-gray-200 rounded-md flex items-center bg-white">
                        <input
                          type="number"
                          min={2000}
                          step={500}
                          value={request.splitMaxHeight || 12000}
                          onChange={(e) => setRequest({ ...request, splitMaxHeight: parseInt(e.target.value) || 12000 })}
                          className="block w-full px-3 py-2 bg-transparent sm:text-sm outline-none"
                        />
                        <span className="pr-3 text-xs text-gray-400">px</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{t.splitMaxHeightDesc}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading || (inputMode === 'url' ? !request.url : inputMode === 'md' ? !mdContent : !request.htmlContent)}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
               >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {t.capturing}
                  </>
                ) : (
                  <>
                    <Camera className="w-5 h-5" />
                    {t.capture} {request.format.toUpperCase()}
                  </>
                )}
              </button>

              {error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-100">
                  {error}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Right Column: Preview */}
        <div className="lg:col-span-7 bg-white p-2 rounded-2xl shadow-sm border border-gray-200 min-h-[600px] flex flex-col">
          <div className="border-b border-gray-100 p-4 flex justify-between items-center bg-gray-50/50 rounded-t-xl">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">{t.preview}</h2>
            <button
               onClick={handleDownload}
               disabled={!resultUrl}
               className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-4 h-4" />
              {t.download}
            </button>
          </div>
          
          <div className="flex-1 bg-gray-100/50 rounded-b-xl flex items-center justify-center p-4 overflow-auto relative">
            {!resultUrl && !loading && !livePreviewHtml && (
              <div className="text-center text-gray-400">
                <ImageIcon className="w-16 h-16 mx-auto mb-3 opacity-50" />
                <p>{t.placeholderPreview}</p>
              </div>
            )}

            {!resultUrl && !loading && livePreviewHtml && (
              <div className="absolute inset-0 bg-white m-4 rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                 <iframe 
                    srcDoc={livePreviewHtml}
                    className="w-full h-full border-none"
                    title="Live Preview"
                    sandbox="allow-same-origin allow-scripts"
                 />
              </div>
            )}
            
            {loading && (
               <div className="text-center text-blue-600">
                  <Loader2 className="w-10 h-10 animate-spin mx-auto mb-3" />
                  <p className="text-sm font-medium animate-pulse">{t.rendering}</p>
                  <p className="text-xs text-black/50 mt-2">{t.renderingWait}</p>
               </div>
            )}

            {resultUrl && !loading && (
              resultType === 'zip' ? (
                 <div className="text-center py-10">
                   <FileJson className="w-20 h-20 text-blue-500 mx-auto mb-4" />
                   <h3 className="text-lg font-medium text-gray-900 mb-2">{t.splitZipReady}</h3>
                   <p className="text-sm text-gray-500 mb-2">{t.splitZipNoPreview}</p>
                   {splitPartCount && (
                     <p className="text-xs text-gray-400 mb-6">{t.splitPartCount}: {splitPartCount}</p>
                   )}
                   <button
                     onClick={handleDownload}
                     className="inline-flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
                   >
                     <Download className="w-4 h-4" />
                     {t.downloadZip}
                   </button>
                 </div>
              ) : request.format === 'pdf' ? (
                 <div className="text-center py-10">
                   <FileText className="w-20 h-20 text-red-500 mx-auto mb-4" />
                   <h3 className="text-lg font-medium text-gray-900 mb-2">{t.pdfReady}</h3>
                   <p className="text-sm text-gray-500 mb-6">{t.pdfNoPreview}</p>
                   <button
                     onClick={handleDownload}
                     className="inline-flex items-center gap-2 px-6 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
                   >
                     <Download className="w-4 h-4" />
                     {t.downloadPdf}
                   </button>
                 </div>
              ) : (
                <img 
                  src={resultUrl} 
                  alt="Captured webpage" 
                  className="max-w-full drop-shadow-md rounded-sm bg-white"
                />
              )
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
