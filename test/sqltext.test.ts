import { describe, expect, it } from 'vitest';
import { bindParameters, identifiers, literal, parameterNames, quoteIdent, SqlTextError, tokens, withoutTrailingSemicolons } from '../src/core/sqltext.js';

const text = { type: 'text' as const, value: '2024-01' };

describe('SQL text', () => {
  it('finds parameters only outside strings, quoted names and comments', () => {
    const sql = `SELECT ':no', "a:no", [b:no], \`c:no\` FROM t -- :no\nWHERE m = :month /* @no */ AND x = $x AND y$z = 1`;
    expect(parameterNames(sql)).toEqual(['month', 'x']);
  });

  it('fills parameters in as literals of their declared types', () => {
    const p = { month: text, n: { type: 'integer' as const, value: 3 }, r: { type: 'real' as const, value: 2 }, s: { type: 'text' as const, value: "it's" } };
    expect(bindParameters('WHERE m = :month AND n > @n AND r < $r AND s = :s', p)).toBe("WHERE m = '2024-01' AND n > 3 AND r < 2.0 AND s = 'it''s'");
    expect(bindParameters("SELECT ':month' -- :month", p)).toBe("SELECT ':month' -- :month");
  });

  it('refuses unknown and positional parameters', () => {
    expect(() => bindParameters('WHERE a = :nope', { month: text })).toThrow(/unknown parameter :nope \(parameters: month\)/);
    expect(() => bindParameters('WHERE a = ?1', {})).toThrow(/positional parameter \?1/);
  });

  it('refuses unterminated strings and names', () => {
    expect(() => tokens("SELECT 'abc")).toThrow(SqlTextError);
    expect(() => tokens('SELECT "abc')).toThrow(/unterminated quoted name/);
    expect(() => tokens('SELECT [abc')).toThrow(/unterminated \[name\]/);
  });

  it('writes literals', () => {
    expect(literal(null, 'text')).toBe('NULL');
    expect(literal(1.5, 'real')).toBe('1.5');
    expect(literal(1e21, 'real')).toBe('1e+21');
    expect(literal(9007199254740993n, 'integer')).toBe('9007199254740993');
    expect(() => literal(1.5, 'integer')).toThrow(/integer/);
    expect(() => literal(Infinity, 'real')).toThrow(/finite/);
    expect(() => literal(1, 'text')).toThrow(/text/);
  });

  it('quotes names, doubling quotes', () => {
    expect(quoteIdent('a"b')).toBe('"a""b"');
  });

  it('lists the names an expression mentions, lowercased', () => {
    expect([...identifiers(`Duration_Min / "Speed ""x"" mph" + [b] + 'not_me'`)].sort()).toEqual(['b', 'duration_min', 'speed "x" mph']);
  });

  it('drops trailing semicolons', () => {
    expect(withoutTrailingSemicolons('SELECT 1;  ;\n')).toBe('SELECT 1');
    expect(withoutTrailingSemicolons("SELECT ';'")).toBe("SELECT ';'");
  });
});
