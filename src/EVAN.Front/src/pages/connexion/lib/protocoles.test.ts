import { describe, expect, it } from 'vitest';
import { DEFAUTS, erreurChamp, erreursAdresse } from './protocoles';
import type { Protocole } from '@/domain/types';

describe('contrôle de l’adresse d’un automate', () => {
  it('les valeurs par défaut de chaque protocole sont valides', () => {
    for (const p of Object.keys(DEFAUTS) as Protocole[]) expect(erreursAdresse(p, DEFAUTS[p]), p).toEqual({});
  });

  it('refuse une adresse OPC UA qui ne peut pas exister', () => {
    expect(erreurChamp('opcua', 'endpoint', 'n’importe quoi')).toBe('De la forme opc.tcp://10.20.1.21:4840.');
    expect(erreurChamp('opcua', 'endpoint', 'opc.tcp://10.20.1.300:4840')).toBeDefined();
    expect(erreurChamp('opcua', 'endpoint', 'opc.tcp://10.20.1.21:99999')).toBeDefined();
    expect(erreurChamp('opcua', 'endpoint', 'http://10.20.1.21:4840')).toBeDefined();
    expect(erreurChamp('opcua', 'endpoint', '')).toBe('À remplir.');
  });

  it('accepte une IP, un nom d’automate et un chemin', () => {
    expect(erreurChamp('opcua', 'endpoint', 'opc.tcp://plc-r01.usine.local:4840/UA/Server')).toBeUndefined();
    expect(erreurChamp('modbus', 'hote', '192.168.0.10')).toBeUndefined();
    expect(erreurChamp('s7', 'hote', 'automate-r02')).toBeUndefined();
    expect(erreurChamp('modbus', 'hote', '192.168.0')).toBeDefined();
  });

  it('borne les réglages numériques', () => {
    expect(erreurChamp('modbus', 'port', '502')).toBeUndefined();
    expect(erreurChamp('modbus', 'port', '0')).toBe('Un nombre entier entre 1 et 65535.');
    expect(erreurChamp('s7', 'rack', '12')).toBeDefined();
    expect(erreurChamp('opcua', 'publication', '2,5')).toBeDefined();
  });

  it('ne juge pas les listes de choix', () => {
    expect(erreurChamp('opcua', 'securite', 'None')).toBeUndefined();
  });

  it('contrôle le sujet MQTT', () => {
    expect(erreurChamp('mqtt', 'topic', 'capteurs/#')).toBeUndefined();
    expect(erreurChamp('mqtt', 'topic', 'capteurs/#/x')).toBeDefined();
    expect(erreurChamp('mqtt', 'topic', 'mes capteurs')).toBeDefined();
  });
});
