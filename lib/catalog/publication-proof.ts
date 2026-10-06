import {contentHash,type Channel,type ProductInput} from './model';

// Application freshness policy, shared by coverage and marketing gates.
export function currentPublicationProof(product:ProductInput,channel:Channel,now=Date.now()) {
 const proof=product._catalog?.channels[channel]?.submission;
 const observedAt=Date.parse(proof?.verified_at||'');
 return Boolean(proof&&!['unknown','submitting','rejected'].includes(proof.status)&&proof.verified_content_hash===contentHash(product,channel)&&Number.isFinite(observedAt)&&observedAt<=now+300000&&now-observedAt<=86400000);
}
