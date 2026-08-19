import React from 'react';
import {Composition} from 'remotion';
import {DeepSeeDemo, FPS, TOTAL} from './DeepSeeDemo';

export const Root: React.FC = () => (
  <>
    <Composition
      id="DeepSeeDemoZh"
      component={DeepSeeDemo}
      durationInFrames={TOTAL}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{locale: 'zh' as const, bgm: true}}
    />
    <Composition
      id="DeepSeeDemoEn"
      component={DeepSeeDemo}
      durationInFrames={TOTAL}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{locale: 'en' as const, bgm: true}}
    />
  </>
);
