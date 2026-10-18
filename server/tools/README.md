# Reverse engineering tools

One-off Python scripts used while reverse engineering the Sonicake protocol, Sonicake Manager
(`5868USB.dll`, `app.so`) and the pedal answers. They are kept as a record of how the formats in
[STRUCTURE.md](../../STRUCTURE.md) and the hardware rules in [AGENTS.md](../../AGENTS.md) were
found; none of them is used by the site or by the compiler server.

- Run them from the repository root (paths such as `server/names_dump.bin` are relative to it).
- The captures they read (`*.bin`, `*.nam`, `*.clo` in `server/`) are not committed; the small ones
  the automated tests need are in `tests/fixtures/`.
- Several scripts still use absolute paths of the machine they were written on, or of a Sonicake
  Manager installation: adjust them before running.
- `sniff_import.bat` / `sniff_import.py` record the SysEx traffic of Sonicake Manager (Windows).

| Prefix | Purpose |
|---|---|
| `analyze_*`, `compare_*`, `verify_*` | Compare captured transfers with what the site builds |
| `disasm_*`, `find_*`, `search_*`, `inspect_*` | Look for functions and data in the vendor binaries |
| `dump_*`, `parse_*`, `print_*`, `list_*`, `query_*`, `read_*` | Decode names, presets and module tables |
| `decode_*`, `test_*` | Experiments on single formats (CRC, Low Model, reassembly) |
