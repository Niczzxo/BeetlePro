import { describe, expect, it } from 'vitest';
import { detectZone } from './detect-zone';

describe('detectZone (ported from the storefront)', () => {
  it('detects Dhaka city from a Mirpur address', () => {
    expect(detectZone('Dhaka', 'House 5, Road 2, Mirpur 10')).toBe(
      'dhaka-city',
    );
  });

  it('detects Dhaka city from the Bangla spelling of Dhaka', () => {
    expect(detectZone('ঢাকা', 'মিরপুর ১০')).toBe('dhaka-city');
  });

  it('lets Savar beat a Dhaka district (sub city checked first)', () => {
    expect(detectZone('Dhaka', 'Savar Bazar, Dhaka')).toBe(
      'dhaka-sub-city',
    );
  });

  it('detects the sub city areas in English', () => {
    expect(detectZone('Gazipur', 'Board Bazar')).toBe('dhaka-sub-city');
    expect(detectZone('Narayanganj', 'Chashara')).toBe('dhaka-sub-city');
    expect(detectZone('Dhaka', 'Demra')).toBe('dhaka-sub-city');
    expect(detectZone('Dhaka', 'Ashulia')).toBe('dhaka-sub-city');
  });

  it('detects the sub city areas in Bangla', () => {
    expect(detectZone('সাভার', '')).toBe('dhaka-sub-city');
    expect(detectZone('', 'গাজীপুর')).toBe('dhaka-sub-city');
    expect(detectZone('', 'নারায়ণগঞ্জ')).toBe('dhaka-sub-city');
    expect(detectZone('', 'কেরানীগঞ্জ')).toBe('dhaka-sub-city');
  });

  it('treats any other district as outside Dhaka', () => {
    expect(detectZone('Sylhet', 'Zindabazar, Sylhet')).toBe(
      'outside-dhaka',
    );
    expect(detectZone('Chattogram', 'Agrabad')).toBe('outside-dhaka');
  });

  it('returns null when the address is still empty', () => {
    expect(detectZone('', '')).toBeNull();
    expect(detectZone('   ', ' ')).toBeNull();
  });
});
