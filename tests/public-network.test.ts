import {describe,expect,it,vi} from 'vitest';
import {publicAddresses} from '../lib/net/public-request';
import {isPrivateIp} from '../lib/extract-security';
describe('public network resolution',()=>{
  it('rejects DNS responses mixing public addresses and private targets',async()=>{
    const resolver=vi.fn(async()=>[{address:'93.184.216.34',family:4},{address:'127.0.0.1',family:4}]);
    await expect(publicAddresses('public.example',resolver as any)).rejects.toThrow('bloqueado');
  });
  it('returns only a single verified DNS resolution for socket pinning',async()=>{
    const resolver=vi.fn(async()=>[{address:'93.184.216.34',family:4}]);
    expect(await publicAddresses('public.example',resolver as any)).toEqual([{address:'93.184.216.34',family:4}]);expect(resolver).toHaveBeenCalledTimes(1);
    for(const ip of ['::ffff:127.0.0.1','198.18.0.1','224.0.0.1','2001:db8::1','::1'])expect(isPrivateIp(ip)).toBe(true);
  });
});
