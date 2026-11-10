import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { quandAuRepos } from './repos';

/** Navigateur simulé : une image, puis le repos, déclenchés à la main. */
function navigateur(avecRepos: boolean) {
  const images: FrameRequestCallback[] = [];
  const repos: { cb: IdleRequestCallback; timeout?: number }[] = [];
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => images.push(cb));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => delete images[id - 1]);
  vi.stubGlobal('requestIdleCallback', avecRepos ? (cb: IdleRequestCallback, o?: IdleRequestOptions) => repos.push({ cb, timeout: o?.timeout }) : undefined);
  vi.stubGlobal('cancelIdleCallback', (id: number) => delete repos[id - 1]);
  return {
    image: () => images.splice(0).forEach((cb) => cb?.(0)),
    repos: () => repos.splice(0).forEach((r) => r?.cb({ didTimeout: false, timeRemaining: () => 10 })),
    delais: () => repos.map((r) => r.timeout),
  };
}

describe('quandAuRepos', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('attend que l’écran soit peint, puis que le navigateur soit au repos', () => {
    const nav = navigateur(true);
    const travail = vi.fn();
    quandAuRepos(travail, 2500);
    nav.repos();
    expect(travail).not.toHaveBeenCalled();
    nav.image();
    expect(nav.delais()).toEqual([2500]);
    expect(travail).not.toHaveBeenCalled();
    nav.repos();
    expect(travail).toHaveBeenCalledOnce();
  });

  it('sans requestIdleCallback (Safari), lance le travail une seconde après l’affichage', () => {
    const nav = navigateur(false);
    const travail = vi.fn();
    quandAuRepos(travail);
    nav.image();
    vi.advanceTimersByTime(999);
    expect(travail).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(travail).toHaveBeenCalledOnce();
  });

  it('ne lance rien une fois annulé, à n’importe quel moment', () => {
    const nav = navigateur(true);
    const avantImage = vi.fn();
    quandAuRepos(avantImage)();
    nav.image();
    nav.repos();
    const avantRepos = vi.fn();
    const annuler = quandAuRepos(avantRepos);
    nav.image();
    annuler();
    nav.repos();
    expect(avantImage).not.toHaveBeenCalled();
    expect(avantRepos).not.toHaveBeenCalled();
  });
});
