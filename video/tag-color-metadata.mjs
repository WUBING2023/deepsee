import {spawnSync} from 'node:child_process';
import {renameSync, rmSync} from 'node:fs';
import {dirname, extname, join, basename} from 'node:path';

const input = process.argv[2];
if (!input) {
  throw new Error('Usage: node tag-color-metadata.mjs <video.mp4>');
}

const extension = extname(input);
const temporary = join(
  dirname(input),
  `${basename(input, extension)}.bt709-${process.pid}-${Date.now()}${extension}`,
);

const result = spawnSync(
  'ffmpeg',
  [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input,
    '-map',
    '0',
    '-c',
    'copy',
    '-bsf:v',
    'h264_metadata=video_full_range_flag=0:colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1',
    '-color_range',
    'tv',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-colorspace',
    'bt709',
    '-movflags',
    '+faststart',
    temporary,
  ],
  {stdio: 'inherit'},
);

if (result.status !== 0) {
  rmSync(temporary, {force: true});
  throw new Error(`ffmpeg failed to tag ${input} with BT.709 metadata`);
}

rmSync(input, {force: true});
renameSync(temporary, input);
