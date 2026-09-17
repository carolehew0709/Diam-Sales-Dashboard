# Brand typography

The DIAM brandbook printed page 32 (PDF spread 17) identifies Century Gothic Regular, Italic, Bold and Bold Italic for desktop communications, and says it can be used for headings and body text. The project owner requests Century Gothic for this dashboard as well.

Both body and display typography use the shared Century Gothic font stack, including navigation, buttons, forms, tables and SVG chart labels. The previous Inter/Manrope Google Fonts requests have been removed. Existing approved dashboard colours remain unchanged.

The user-supplied Century Gothic Paneuropean fonts are now bundled in `public/fonts/century-gothic/` as losslessly compressed WOFF files, retaining their font metadata and a separate NOTICE.json. CSS uses the dedicated `DIAM Century Gothic` family with explicit Regular (400), SemiBold (600), Bold (700), ExtraBold (800), Black (900), and Regular/Bold italic faces. Files are served from the site's own origin and loaded as needed with font-display: swap; users do not need the font installed. System fonts remain fallbacks for unavailable glyphs (including Chinese) or loading failures. The supplied files contain Monotype license notices; this packaging does not establish or change their license rights.

Brandbook printed pages 27–29 require the supplied unmodified logo, clear space, and a black logo on light backgrounds or white on dark backgrounds. The header uses the supplied white asset and the login screen uses the black asset, preserving aspect ratio. The logo is an image, not typeset in Century Gothic.
