import { describe, expect, it } from 'vitest';
import { parseEnvFile } from './env-file.mjs';

describe('parseEnvFile', () => {
  it('parses plain KEY=value lines', () => {
    expect(parseEnvFile('A=1\nB=two').vars).toEqual({ A: '1', B: 'two' });
  });

  it('tolerates spaces around =, CRLF, blank lines and comments', () => {
    const text = '# AMO keys\r\n\r\nWEB_EXT_API_KEY = user:1:2\r\n  # indented comment\r\nWEB_EXT_API_SECRET= abc \r\n';
    const { vars, invalidLines } = parseEnvFile(text);
    expect(vars).toEqual({ WEB_EXT_API_KEY: 'user:1:2', WEB_EXT_API_SECRET: 'abc' });
    expect(invalidLines).toEqual([]);
  });

  it('strips matching single or double quotes, keeping inner content verbatim', () => {
    const { vars } = parseEnvFile(`A="x # y"\nB='  z  '\nC=""`);
    expect(vars).toEqual({ A: 'x # y', B: '  z  ', C: '' });
  });

  it('drops trailing comments on unquoted values and accepts export', () => {
    expect(parseEnvFile('export A=1 # note\nB=a#b').vars).toEqual({ A: '1', B: 'a#b' });
  });

  it('reports malformed lines by number without failing the rest', () => {
    const { vars, invalidLines } = parseEnvFile('just text\nA=1\n=nokey\nB="unterminated\n1X=2');
    expect(vars).toEqual({ A: '1' });
    expect(invalidLines).toEqual([1, 3, 4, 5]);
  });

  it('ignores a leading UTF-8 BOM', () => {
    expect(parseEnvFile('\uFEFFA=1').vars).toEqual({ A: '1' });
  });

  it('keeps empty values and lets later lines win', () => {
    expect(parseEnvFile('A=\nB=1\nB=2').vars).toEqual({ A: '', B: '2' });
  });
});
