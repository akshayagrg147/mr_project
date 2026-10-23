"""Package the reviewable source and verification evidence, excluding local data/secrets."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
excluded = {'node_modules', 'build', 'dist', '.gradle', '.git', '.data', 'playwright-report', 'deliverables'}
paths = []
for folder in ('apps', 'packages', 'scripts', 'tests', 'docs'):
    for path in (root / folder).rglob('*'):
        if not path.is_file() or any(part in excluded for part in path.relative_to(root).parts):
            continue
        if path.name == 'local.properties' or path.name.startswith('.env') or path.suffix in {'.jks', '.keystore', '.p12', '.pem'}:
            continue
        paths.append(path)
for name in ('README.md', 'package.json', 'package-lock.json', 'tsconfig.json', 'playwright.config.ts', '.nvmrc', '.gitignore', '.env.example', 'review/requirements.md', 'review/HANDOFF.md'):
    paths.append(root / name)
out = root / 'deliverables' / 'MR-Connect-source.zip'
out.parent.mkdir(exist_ok=True)
with ZipFile(out, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(set(paths)):
        archive.write(path, 'mr-connect/' + str(path.relative_to(root)))
print(f'Packaged {len(set(paths))} source and evidence files: {out}')
