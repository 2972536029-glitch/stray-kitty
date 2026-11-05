import titleArtwork from './assets/opening/city-skyline-night.png';

// One environment plate keeps city textures and lighting on the same pixel grid.
// The logo, native cat sprites and all controls remain live UI layers.
export default function StartMenuBackdrop() {
  return <div className="start-menu-backdrop" aria-hidden="true">
    <img src={titleArtwork} alt="" fetchPriority="high"/>
    <div className="opening-stars"><i/><i/><i/><i/><i/><i/></div>
  </div>;
}
