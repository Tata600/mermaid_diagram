/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { EmbeddedSyntaxHighlightingComponent } from "@html_editor/others/embedded_components/backend/syntax_highlighting/syntax_highlighting";

const MERMAID_CDN_URL = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

/**
 * Extended languages list including Mermaid
 */
export const MERMAID_LANGUAGES = {
    plaintext: "Plain Text",
    markdown: "Markdown",
    mermaid: "Mermaid",
    javascript: "Javascript",
    typescript: "Typescript",
    jsdoc: "JSDoc",
    java: "Java",
    python: "Python",
    html: "HTML",
    xml: "XML",
    svg: "SVG",
    json: "JSON",
    css: "CSS",
    sass: "SASS",
    scss: "SCSS",
    sql: "SQL",
    diff: "Diff",
};

let mermaidModule = null;
let mermaidLoadingPromise = null;
let currentTheme = null;

// UTF-8 safe base64 encoding/decoding
function encodeB64UTF8(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

function decodeB64UTF8(b64) {
    return decodeURIComponent(escape(atob(b64)));
}

/**
 * Convert HTML with <br> tags to text with newlines
 */
function htmlToText(html) {
    // Create a temporary element to properly parse HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // Replace <br> with newlines
    temp.querySelectorAll('br').forEach(br => {
        br.replaceWith('\n');
    });
    
    // Get text content and clean up
    return temp.textContent
        .replace(/[\u200B\uFEFF]/g, '')
        .replace(/\n+$/, '');  // Remove trailing newlines
}

function getOdooTheme() {
    return document.documentElement.dataset.colorScheme ||
        document.cookie.split('; ').find(row => row.startsWith('color_scheme='))?.split('=')[1] ||
        'light';
}

function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
}

function getMermaidThemeConfig() {
    const isDark = getOdooTheme() === 'dark';
    const primary = cssVar('--o-brand-primary', isDark ? '#4a90a4' : '#714B67');
    const textColor = cssVar('--o-main-text-color', isDark ? '#e5e7eb' : '#374151');
    const bgColor = cssVar('--o-view-background-color', isDark ? '#374151' : '#fff');
    
    return {
        theme: 'base',
        themeVariables: isDark ? {
            primaryColor: primary,
            primaryTextColor: '#fff',
            primaryBorderColor: '#5a6d7a',
            lineColor: '#8b9aa5',
            secondaryColor: '#3d4f5f',
            tertiaryColor: '#2d3e4a',
            background: 'transparent',
            mainBkg: bgColor,
            secondBkg: '#2d3748',
            border1: '#4b5563',
            border2: '#6b7280',
            arrowheadColor: '#9ca3af',
            fontFamily: 'inherit',
            fontSize: '14px',
            textColor: textColor,
            nodeTextColor: '#f3f4f6',
        } : {
            primaryColor: primary,
            primaryTextColor: '#fff',
            primaryBorderColor: '#5a3d52',
            lineColor: '#6b7280',
            secondaryColor: '#f3e8ee',
            tertiaryColor: '#faf5f8',
            background: 'transparent',
            mainBkg: bgColor,
            secondBkg: '#f9fafb',
            border1: '#e5e7eb',
            border2: '#d1d5db',
            arrowheadColor: '#374151',
            fontFamily: 'inherit',
            fontSize: '14px',
            textColor: textColor,
            nodeTextColor: '#1f2937',
        }
    };
}

/**
 * Patch the component to add Mermaid rendering
 */
patch(EmbeddedSyntaxHighlightingComponent.prototype, {
    setup() {
        super.setup();
        this.mermaidContainer = null;
        this.mermaidRendered = false;
        this._lastMermaidSource = null;
        this._themeObserver = null;
        
        // Check for encoded mermaid source in initial value (stored as comment)
        this._extractMermaidSourceFromInitialValue();
    },
    
    /**
     * Extract base64 encoded mermaid source from initial value if present
     */
    _extractMermaidSourceFromInitialValue() {
        const initialValue = this.props.initialValue || "";
        const match = initialValue.match(/<!--MERMAID_SRC:([^>]+)-->/);
        if (match) {
            try {
                this._decodedMermaidSource = decodeB64UTF8(match[1]);
            } catch (e) {
                console.warn("Failed to decode mermaid source from comment");
            }
        }
    },

    async loadMermaid() {
        const theme = getOdooTheme();
        
        if (mermaidModule && currentTheme !== theme) {
            mermaidModule.initialize({
                startOnLoad: false,
                securityLevel: 'strict',
                suppressErrorRendering: true,
                ...getMermaidThemeConfig(),
            });
            currentTheme = theme;
            return mermaidModule;
        }
        
        if (mermaidModule) return mermaidModule;
        if (mermaidLoadingPromise) return mermaidLoadingPromise;
        
        mermaidLoadingPromise = (async () => {
            try {
                const module = await import(/* @vite-ignore */ MERMAID_CDN_URL);
                mermaidModule = module.default;
                mermaidModule.initialize({
                    startOnLoad: false,
                    securityLevel: 'strict',
                    suppressErrorRendering: true,
                    ...getMermaidThemeConfig(),
                });
                currentTheme = theme;
                return mermaidModule;
            } catch (e) {
                console.error("Failed to load Mermaid:", e);
                mermaidLoadingPromise = null;
                return null;
            }
        })();
        
        return mermaidLoadingPromise;
    },

    openCodeToolbar() {
        this.props.codeToolbar.open({
            target: this.state.host,
            props: {
                target: this.state.host,
                prismSource: this.textarea,
                languages: MERMAID_LANGUAGES,
                onLanguageChange: this.onLanguageChange.bind(this),
            },
        });
    },

    async highlight(focus = this.document.activeElement === this.textarea) {
        const languageId = this.getFromHostDataset("languageId");

        if (languageId === "mermaid") {
            this.setupThemeObserver();
            await this.renderMermaid(focus);
            return;
        }

        this.cleanupThemeObserver();
        this.removeMermaidContainer();
        this.mermaidRendered = false;
        return super.highlight(focus);
    },

    setupThemeObserver() {
        if (this._themeObserver) return;
        
        this._themeObserver = new MutationObserver(() => {
            if (this.getFromHostDataset("languageId") === "mermaid") {
                this._lastMermaidSource = null;
                this.highlight(false);
            }
        });
        this._themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-color-scheme']
        });
    },

    cleanupThemeObserver() {
        if (this._themeObserver) {
            this._themeObserver.disconnect();
            this._themeObserver = null;
        }
    },

    /**
     * Get the Mermaid source code, with multiple fallbacks
     */
    getMermaidSource() {
        // 1. Check textarea (user is editing)
        if (this.textarea?.value && this.textarea.value.includes('\n')) {
            return this.textarea.value;
        }
        
        // 2. Check if we decoded source from HTML comment
        if (this._decodedMermaidSource) {
            return this._decodedMermaidSource;
        }
        
        // 3. Check host dataset
        const hostValue = this.getFromHostDataset("value") || "";
        
        // Remove any embedded comment marker
        const cleanHostValue = hostValue.replace(/<!--MERMAID_SRC:[^>]+-->\n?/, '');
        
        // If it has newlines, use it
        if (cleanHostValue.includes('\n')) {
            return cleanHostValue;
        }
        
        // 4. Check props initialValue (cleaned)
        const initialValue = (this.props.initialValue || "").replace(/<!--MERMAID_SRC:[^>]+-->\n?/, '');
        if (initialValue.includes('\n')) {
            return initialValue;
        }
        
        // 5. Try to convert from pre's innerHTML (has <br> tags)
        if (this.pre?.innerHTML && this.pre.innerHTML.includes('<br')) {
            const converted = htmlToText(this.pre.innerHTML);
            if (converted.includes('\n')) {
                return converted;
            }
        }
        
        // 6. Final fallback
        return cleanHostValue || initialValue || this.textarea?.value || "";
    },

    /**
     * Create value with embedded source comment for persistence
     */
    createValueWithSource(value) {
        try {
            const encoded = encodeB64UTF8(value);
            // Embed the base64 source as an HTML comment that will survive the save
            return `<!--MERMAID_SRC:${encoded}-->\n${value}`;
        } catch (e) {
            return value;
        }
    },

    async renderMermaid(focus = false) {
        const mermaid = await this.loadMermaid();
        if (!mermaid) {
            this.pre.textContent = "Failed to load Mermaid library";
            return;
        }

        // Get the source code (with newlines preserved)
        let value = this.getMermaidSource();

        // Sync textarea with clean value (without comment)
        const cleanValue = value.replace(/<!--MERMAID_SRC:[^>]+-->\n?/, '');
        if (this.textarea.value !== cleanValue) {
            this.textarea.value = cleanValue;
        }

        const trimmedValue = cleanValue.trim();
        
        // Skip re-render if nothing changed
        if (trimmedValue === this._lastMermaidSource && this.mermaidRendered && this.mermaidContainer) {
            return;
        }

        // Create container if needed
        if (!this.mermaidContainer) {
            this.mermaidContainer = this.document.createElement("div");
            this.mermaidContainer.className = "o_mermaid_container";
            
            // Accessibility
            this.mermaidContainer.setAttribute('role', 'button');
            this.mermaidContainer.setAttribute('tabindex', '0');
            this.mermaidContainer.setAttribute('aria-label', 'Mermaid diagram - click to edit');
            
            this.pre.parentNode.insertBefore(this.mermaidContainer, this.pre.nextSibling);
            
            // Click to open toolbar
            this.mermaidContainer.addEventListener("click", () => {
                this.state.isActive = true;
                this.openCodeToolbar();
            });
            
            // Keyboard activation
            this.mermaidContainer.addEventListener("keydown", (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.state.isActive = true;
                    this.openCodeToolbar();
                }
            });
            
            this.mermaidContainer.addEventListener("mouseleave", (ev) => {
                const isLanguageSelectorOpen = !!this.document.querySelector(
                    ".dropdown-menu.o_language_selector"
                );
                if (!isLanguageSelectorOpen && !ev.relatedTarget?.closest?.(".o_code_toolbar")) {
                    this.state.isActive = false;
                    this.props.codeToolbar.close();
                }
            });
        }

        // Update pre element content
        this.pre.textContent = cleanValue;
        
        if (!trimmedValue) {
            this.mermaidContainer.innerHTML = `<div class="o_mermaid_placeholder">Enter code, then select Mermaid to render</div>`;
            this.mermaidContainer.style.display = "flex";
            this.pre.style.display = "none";
            this.textarea.style.display = "none";
            this.mermaidRendered = false;
            this._lastMermaidSource = trimmedValue;
        } else {
            try {
                const id = `mermaid-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
                const { svg } = await mermaid.render(id, trimmedValue);
                
                this.mermaidContainer.innerHTML = svg;
                this.mermaidContainer.style.display = "flex";
                this.pre.style.display = "none";
                this.textarea.style.display = "none";
                this.mermaidRendered = true;
                this._lastMermaidSource = trimmedValue;
                
            } catch (e) {
                this.mermaidContainer.innerHTML = `<div class="o_mermaid_error">
                    <span>Invalid Mermaid syntax. Switch to Plain Text to edit.</span>
                </div>`;
                this.mermaidContainer.style.display = "flex";
                this.pre.style.display = "none";
                this.textarea.style.display = "none";
                this.mermaidRendered = false;
                this._lastMermaidSource = null;
            }
        }

        // Commit value WITH embedded source comment for persistence
        const valueWithSource = this.createValueWithSource(cleanValue);
        await this.commitToHost({ value: valueWithSource });
    },

    removeMermaidContainer() {
        if (this.mermaidContainer) {
            this.mermaidContainer.remove();
            this.mermaidContainer = null;
        }
        if (this.pre) {
            this.pre.style.display = "";
        }
        if (this.textarea) {
            this.textarea.style.display = "";
        }
        this.mermaidRendered = false;
        this._lastMermaidSource = null;
        this._decodedMermaidSource = null;
    },

    onHover() {
        const languageId = this.getFromHostDataset("languageId");
        
        if (languageId === "mermaid" && this.mermaidRendered) {
            return;
        }
        
        return super.onHover();
    },

    onLanguageChange(languageId) {
        const previousLanguage = this.getFromHostDataset("languageId");
        
        if (previousLanguage === "mermaid" && languageId !== "mermaid") {
            this.cleanupThemeObserver();
            this.removeMermaidContainer();
            
            // Clean up the embedded comment when switching away from Mermaid
            const currentValue = this.getFromHostDataset("value") || "";
            const cleanValue = currentValue.replace(/<!--MERMAID_SRC:[^>]+-->\n?/g, '');
            
            // Update textarea with clean value
            this.textarea.value = cleanValue;
            
            // Commit clean value AND language change together
            if (this.getFromHostDataset("languageId") !== languageId) {
                this.props.codeToolbar.close();
                this.textarea.focus();
                this.props.onTextareaFocus();
                this.commitToHost({ value: cleanValue, languageId }).then(() => {
                    this.openCodeToolbar();
                });
            }
            return;
        }

        if (this.getFromHostDataset("languageId") !== languageId) {
            this.props.codeToolbar.close();
            
            if (languageId !== "mermaid") {
                this.textarea.focus();
                this.props.onTextareaFocus();
            }
            
            this.commitToHost({ languageId }).then(() => {
                this.openCodeToolbar();
            });
        }
    },
});
