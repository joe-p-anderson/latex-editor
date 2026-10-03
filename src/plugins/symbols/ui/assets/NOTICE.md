# Detexify

The symbol library (symbols.json), its images and the handwriting samples (samples.json.gz) come from Detexify Next by Daniel Kirsch, https://github.com/kirel/detexify-next, commit ba0742b03b01a7a958110ced23d509a72d85744e. Detexify is at https://detexify.kirelabs.org.

The classifier in src/shared/detexify.ts is a port of its legacy DTW classifier.

- The code is under the MIT licence below.
- The handwriting samples are the Detexify training data, published under the Open Database License (ODbL) 1.0: https://opendatacommons.org/licenses/odbl/1-0/. They are converted here to integer coordinates; nothing else is changed.

Regenerate these files with `node scripts/import-detexify.mjs [commit]`.

## MIT licence (Detexify Next)

```
MIT License

Copyright (c) 2026 Daniel Kirsch

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
