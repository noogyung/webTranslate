import glob, re
import_regex = re.compile(r'import\s+\{([^}]+)\}\s+from\s+[\'\"]./([^\'\"]+)[\'\"]')
export_regex = re.compile(r'export\s+(?:async\s+)?(?:function|const)\s+([a-zA-Z0-9_$]+)')
exports_map = {}

# Gather all exports
for f in glob.glob('src/content/*.js'):
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
        exports_map[f.replace('\\', '/')] = set(export_regex.findall(content))

# Check imports
errors = []
for f in glob.glob('src/content/*.js'):
    f = f.replace('\\', '/')
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
        for match in import_regex.finditer(content):
            imported_vars = [v.strip() for v in match.group(1).split(',')]
            target_file = match.group(2)
            target_path = 'src/content/' + target_file
            if target_path not in exports_map:
                errors.append(f'{f}: Imports from non-existent {target_path}')
                continue
            
            for var in imported_vars:
                if var not in exports_map[target_path]:
                    errors.append(f'{f}: Imports {var} which is not exported by {target_path}')

for e in errors:
    print(e)
if not errors:
    print('No missing exports found!')
