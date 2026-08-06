import glob, re, os
exports_map = {}
for file_path in glob.glob('src/content/*.js'):
    if file_path.endswith('state.js') or file_path.endswith('boot.js'): continue
    with open(file_path, 'r', encoding='utf-8') as f: content = f.read()
    mod_name = os.path.basename(file_path)
    exports_map[mod_name] = set()
    def export_func(match):
        exports_map[mod_name].add(match.group(1))
        return match.group(0).replace('function', 'export function', 1)
    content = re.sub(r'^\s*(?:async\s+)?function\s+([a-zA-Z0-9_$]+)\s*\(', export_func, content, flags=re.MULTILINE)
    with open(file_path, 'w', encoding='utf-8') as f: f.write(content)

for file_path in glob.glob('src/content/*.js'):
    if file_path.endswith('boot.js'): continue
    with open(file_path, 'r', encoding='utf-8') as f: content = f.read()
    imports = []
    # Strip old imports at the top
    content = re.sub(r'^(?:import .*;\s*)+', '', content).lstrip()
    
    if re.search(r'\bstate\.', content) and not file_path.endswith('state.js'):
        imports.append('import { state } from "./state.js";')
    if re.search(r'\bisLLMEngine\b', content) and not file_path.endswith('state.js'):
        imports.append('import { isLLMEngine } from "./state.js";')
        
    for mod, symbols in exports_map.items():
        if mod == os.path.basename(file_path): continue
        used_symbols = [sym for sym in symbols if re.search(rf'\b{sym}\b', content)]
        if used_symbols:
            imports.append(f'import {{ { ", ".join(used_symbols) } }} from "./{mod}";')
            
    if imports:
        content = '\n'.join(imports) + '\n\n' + content
        
    with open(file_path, 'w', encoding='utf-8') as f: f.write(content)
print('Fixed exports and imports!')
