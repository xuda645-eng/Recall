import { useEffect, useState } from 'react';
import type { MediaAsset } from '../../shared/media';

export function MediaPackagePreview({ assets }: { assets: MediaAsset[] }): JSX.Element | null {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const next = assets.slice(0, 4).map(asset => URL.createObjectURL(new Blob([asset.bytes], { type: asset.mime })));
    setUrls(next);
    return () => next.forEach(url => URL.revokeObjectURL(url));
  }, [assets]);
  if (!assets.length) return null;
  return <section className="m-panel"><h3>来源附件</h3><p>{assets.length} 张图片 · {Math.ceil(assets.reduce((total, asset) => total + asset.bytes.byteLength, 0) / 1024)} KB，校验通过</p><p className="m-note">确认导入后才保存图片；同一截图被多张卡引用时只存一份。</p><details><summary>预览图片（前 4 张）</summary>{urls.map((url, index) => <img key={url} src={url} alt={`待导入来源截图 ${index + 1}`} style={{ width: '100%', maxHeight: 240, objectFit: 'contain' }}/>)}</details></section>;
}
