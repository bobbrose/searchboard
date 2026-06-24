import { describe, it, expect } from 'vitest';
import { withProtocol, displayUrl } from './website.js';

describe('withProtocol', () => {
  it('adds https:// when no scheme is present', () => {
    expect(withProtocol('acme.com')).toBe('https://acme.com');
  });

  it('leaves an existing http(s) scheme untouched', () => {
    expect(withProtocol('http://acme.com')).toBe('http://acme.com');
    expect(withProtocol('https://acme.com')).toBe('https://acme.com');
    expect(withProtocol('HTTPS://acme.com')).toBe('HTTPS://acme.com');
  });
});

describe('displayUrl', () => {
  it('strips the scheme and trailing slashes', () => {
    expect(displayUrl('https://acme.com/')).toBe('acme.com');
    expect(displayUrl('http://www.acme.com/careers/')).toBe('www.acme.com/careers');
    expect(displayUrl('acme.com')).toBe('acme.com');
  });
});
