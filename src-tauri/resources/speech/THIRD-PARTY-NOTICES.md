# Local speech components

CUBE bundles Vosk API 0.3.45 and vosk-model-small-es-0.42 by Alpha Cephei / AC Technologies LLC. Both are distributed under Apache License 2.0. Upstream copyright and license files are retained with the bundled resources.

- Engine: https://github.com/alphacep/vosk-api/releases/tag/v0.3.45
- Spanish model and license listing: https://alphacephei.com/vosk/models
- API source: https://github.com/alphacep/vosk-api

The official Windows engine package also contains GCC runtime libraries (libgcc_s_seh-1.dll, libstdc++-6.dll and libwinpthread-1.dll). GCC libraries are distributed with the GCC Runtime Library Exception; libwinpthread carries the mingw-w64 runtime notices. Refer to the accompanying runtime license files.

Audio is captured through CPAL (Apache-2.0), decoded in memory, and is not stored or sent over the network by this speech module. Text submitted to a configured remote language model follows the existing provider configuration.
