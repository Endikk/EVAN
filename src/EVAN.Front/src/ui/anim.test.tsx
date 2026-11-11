import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { AnimatedNumber } from './anim';

describe('nombre animé', () => {
  it('affiche sa vraie valeur dès le premier affichage, sans partir de 0', () => {
    const html = renderToString(<AnimatedNumber value={42} />);
    expect(html).toContain('>42<');
    expect(html).not.toContain('>0<');
  });

  it('garde le format de la valeur finale', () => {
    const html = renderToString(<AnimatedNumber value={3.5} format={(v) => v.toFixed(1).replace('.', ',')} />);
    expect(html).toContain('>3,5<');
  });
});
