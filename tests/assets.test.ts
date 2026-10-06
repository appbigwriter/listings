import {describe,expect,it} from 'vitest';
import sharp from 'sharp';
import {inspectAsset} from '../lib/catalog/assets';
import {readBodyBytes} from '../lib/http';
describe('private evidence upload boundaries',()=>{
  it('checks type/signatures, hashes and immutable metadata',async()=>{
    const bytes=Buffer.from('%PDF-1.7\nfixture\n%%EOF');const asset=await inspectAsset(bytes,'application/pdf','certificate.pdf');
    expect(asset.sha256).toHaveLength(64);expect(asset.byte_size).toBe(bytes.length);
    await expect(inspectAsset(bytes,'image/jpeg','fake.jpg')).rejects.toThrow('Imagem');
    await expect(inspectAsset(Buffer.from('plain text'),'application/pdf','fake.pdf')).rejects.toThrow('PDF');
  });
  it('rejects mismatched image formats, paths and oversized streaming uploads',async()=>{
    const png=await sharp({create:{width:16,height:16,channels:3,background:'white'}}).png().toBuffer();
    expect((await inspectAsset(png,'image/png','image.png')).mime_type).toBe('image/png');
    await expect(inspectAsset(png,'image/jpeg','fake.jpg')).rejects.toThrow('Formato');
    await expect(inspectAsset(png,'image/png','../image.png')).rejects.toThrow('Nome');
    await expect(readBodyBytes(new Request('https://fixture',{method:'POST',body:png}),2)).rejects.toMatchObject({status:413});
  });
});
