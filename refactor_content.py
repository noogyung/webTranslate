import glob, re, os

# 1. State Variables
state_vars = [
    'isTranslated', 'isTranslating', 'isObserverBusy', 'translatedElements',
    'statusEl', 'hideTimer', 'observer', 'pendingNodes', 'observerTimer',
    'cachedSettings', 'localCache', 'lazyObserver', 'lazyObserverTimer',
    'pendingLazyBlocks', 'elementToBlockMap', 'LLM_ENGINES', 'SKIP_TAGS',
    'INLINE_TAGS', 'COMPLEX_ANCESTOR_SEL', 'COMPLEX_CHILD_SEL', 'HIDDEN_ANCESTOR_SEL',
    'BATCH_SIZE', 'activeDictPopup', 'dictCache', 'dictRateLimitUntil', 'currentPopupContext'
]

def prefix_state(content):
    def repl(match):
        prefix, var_name = match.group(1), match.group(2)
        if prefix.endswith('state.') or prefix.endswith('let ') or prefix.endswith('const ') or prefix.endswith('var ') or prefix.endswith('import '):
            return match.group(0)
        return f'{prefix}state.{var_name}'
    
    for var in state_vars:
        content = re.sub(rf'(^|[^a-zA-Z0-9_$])({var})\b', repl, content)
    return content

# 2. Fix state.js
with open('src/content/state.js', 'r', encoding='utf-8') as f:
    state_content = f.read()

new_state = 'export const state = {\n'
for line in state_content.split('\n'):
    if line.strip().startswith('var '):
        name, val = line.strip()[4:].split('=', 1)
        name, val = name.strip(), val.strip().rstrip(';')
        new_state += f'  {name}: {val},\n'

new_state += '};\n\nexport function isLLMEngine(mode) { return state.LLM_ENGINES.has((mode || "").toLowerCase()); }\n'
with open('src/content/state.js', 'w', encoding='utf-8') as f:
    f.write(new_state)

# 3. Add exports to all other files and gather exported symbols
exports_map = {} # module_name -> set of exported symbols
for file_path in glob.glob('src/content/*.js'):
    if file_path.endswith('state.js') or file_path.endswith('boot.js'):
        continue
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Prefix state vars
    content = prefix_state(content)
    
    mod_name = os.path.basename(file_path)
    exports_map[mod_name] = set()
    
    # Find functions and prepend export
    def export_func(match):
        func_name = match.group(1)
        exports_map[mod_name].add(func_name)
        return match.group(0).replace('function', 'export function', 1)
    
    content = re.sub(r'^(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(', export_func, content, flags=re.MULTILINE)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

# 4. Auto-import symbols
for file_path in glob.glob('src/content/*.js'):
    if file_path.endswith('boot.js'):
        continue
        
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    imports = []
    
    # Check if state is used
    if re.search(r'\bstate\.', content) and not file_path.endswith('state.js'):
        imports.append('import { state } from "./state.js";')
        
    # Check if isLLMEngine is used
    if re.search(r'\bisLLMEngine\b', content) and not file_path.endswith('state.js'):
        imports.append('import { isLLMEngine } from "./state.js";')
        
    for mod, symbols in exports_map.items():
        if mod == os.path.basename(file_path):
            continue
        
        used_symbols = []
        for sym in symbols:
            # Check if symbol is used (not just exported or defined)
            if re.search(rf'\b{sym}\b', content):
                used_symbols.append(sym)
                
        if used_symbols:
            imports.append(f'import {{ {", ".join(used_symbols)} }} from "./{mod}";')
            
    if imports:
        content = '\n'.join(imports) + '\n\n' + content
        
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

print("Modularization complete!")
