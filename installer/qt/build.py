#!/usr/bin/env python3
"""Assemble native Qt IFW packages. Build each executable on its target OS."""
import argparse
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
IFW_VERSION = '4.7.0'
MISE_VERSION = '2026.11.2'


def build(target, output, ifw_root=None, prepare_only=False):
    output = output.resolve()
    stage = output / 'package'
    # Only overwrite a directory owned by this build, not arbitrary output contents.
    if stage.exists():
        if not (stage / '.fyso-build').exists():
            raise ValueError('Refusing to overwrite an unrecognized package directory')
        shutil.rmtree(stage)
    stage.mkdir(parents=True)
    (stage / '.fyso-build').touch()
    config = stage / 'config'; shutil.copytree(HERE / 'config', config)
    package = stage / 'packages/dev.fyso.setup'
    meta = package / 'meta'; shutil.copytree(HERE / 'meta', meta)
    data = package / 'data'; shutil.copytree(HERE / 'runtime', data, ignore=shutil.ignore_patterns('__pycache__'))
    shutil.copytree(HERE / 'locales', data / 'locales')
    copy = {lang: json.loads((HERE / f'locales/{lang}.json').read_text()) for lang in ['es','en']}
    script = meta / 'installscript.qs'
    script.write_text('var FYSO_COPY = ' + json.dumps(copy, ensure_ascii=False) + ';\n' + script.read_text())
    subprocess.run([sys.executable, str(ROOT / 'installer/make-dag.py'),
                    str(ROOT / 'template/mise.toml.jinja'), str(data / 'fyso-install.yaml')], check=True, stdout=subprocess.DEVNULL)
    with (data / 'mise-bootstrap.sh').open('w') as out:
        subprocess.run(['mise','generate','install-script','-V',MISE_VERSION], check=True, stdout=out)
    if prepare_only:
        return stage
    if (target == 'windows') != (platform.system() == 'Windows') or (target == 'linux' and platform.system() != 'Linux'):
        raise ValueError('Build the executable on the target OS; use --prepare-only elsewhere')
    if not ifw_root:
        raise ValueError('Supply --ifw-root pointing to Qt Installer Framework ' + IFW_VERSION)
    creator = ifw_root / 'bin' / ('binarycreator.exe' if target == 'windows' else 'binarycreator')
    base = ifw_root / 'bin' / ('installerbase.exe' if target == 'windows' else 'installerbase')
    version = subprocess.run([str(base),'--version'], capture_output=True, text=True, check=True,
                             env={**os.environ,'QT_QPA_PLATFORM':'offscreen'})
    if not re.search(r'\b' + re.escape(IFW_VERSION) + r'\b', version.stdout + version.stderr):
        raise ValueError('Qt Installer Framework version must be ' + IFW_VERSION)
    filename = 'Fyso-Installer-windows.exe' if target == 'windows' else f'Fyso-Installer-linux-{platform.machine()}.run'
    result = output / filename
    subprocess.run([str(creator), '--offline-only','-c',str(config/'config.xml'),'-p',str(stage/'packages'),str(result)],check=True)
    return result


if __name__ == '__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--target',choices=['linux','windows'],required=True)
    p.add_argument('--ifw-root',type=Path)
    p.add_argument('--output',type=Path,default=HERE/'dist')
    p.add_argument('--prepare-only',action='store_true')
    a=p.parse_args()
    print(build(a.target,a.output,a.ifw_root,a.prepare_only))
