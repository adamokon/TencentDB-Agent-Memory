# Native OKF text content

UTF-8/default bundle content must be a well-formed Unicode string. Import and
preflight reject unpaired UTF-16 surrogates with HTTP 400, before document writes,
because Node would otherwise silently replace them with U+FFFD while encoding.
Valid astral characters and an explicit U+FFFD remain accepted. Use base64 to
preserve arbitrary binary bytes; Markdown must still decode as valid UTF-8.

This change adds no dependency, data schema migration, model processing or
automatic rewriting of existing memory. A rejected import may update the Wiki
metadata timestamp during its status roundtrip; content and semantic row fields
are retained. Existing service/admin authentication boundaries remain unchanged.
Independent review remains outstanding.
