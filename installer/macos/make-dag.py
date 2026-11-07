#!/usr/bin/env python3
"""Compatibility entry point for the shared Dagu installer generator."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).resolve().parents[1] / 'make-dag.py'), run_name='__main__')
