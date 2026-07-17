-- Align published product categories with Drone World (aircraft) vs Drone Care (accessories).

update public.mithron_products
set
  category = 'Surveillance Drones',
  interests = array_remove(array_append(coalesce(interests, '{}'::text[]), 'surveillance'), 'components'),
  updated_at = timezone('utc', now())
where slug in (
  'source-nuno-no-tc-required',
  'source-monal-4k',
  'source-monal-4k-thermal'
);

update public.mithron_products
set
  category = 'Accessories',
  interests = array_remove(array_append(coalesce(interests, '{}'::text[]), 'components'), 'video-drones'),
  updated_at = timezone('utc', now())
where slug in (
  'source-decafly-d5x-battery-frame',
  'source-18-inch-drone-frame',
  'source-siyi-a2-mini-ultra-wide-angle-fpv-gimbal-single-axis-camera-sensor',
  'source-skydroid-h12-with-inbuilt-screen-and-camera-remote-control',
  'source-15-inch-drone-frame',
  'source-decafly-d5x-cfrp-arm-black',
  'source-skydroid-c10-three-axis-gimbal-camera',
  'source-decafly-d5x-3d-printed-arm-white',
  'source-siyi-a8-mini-4k-8mp-ultra-hd-6x-digital-zoom-gimbal-camera',
  'source-decafly-d5x-landing-gear',
  'source-jiyi-terrain-following-radar-for-agriculture-drones',
  'source-skyrc-pc1080-dual-channel-charger-for-agriculture-drone-batteries',
  'source-decafly-d5x-cfrp-frame'
);

update public.mithron_products
set
  interests = array_remove(coalesce(interests, '{}'::text[]), 'agriculture'),
  updated_at = timezone('utc', now())
where slug in (
  'source-decafly-d5x-battery-frame',
  'source-18-inch-drone-frame',
  'source-siyi-a2-mini-ultra-wide-angle-fpv-gimbal-single-axis-camera-sensor',
  'source-skydroid-h12-with-inbuilt-screen-and-camera-remote-control',
  'source-15-inch-drone-frame',
  'source-decafly-d5x-cfrp-arm-black',
  'source-skydroid-c10-three-axis-gimbal-camera',
  'source-decafly-d5x-3d-printed-arm-white',
  'source-siyi-a8-mini-4k-8mp-ultra-hd-6x-digital-zoom-gimbal-camera',
  'source-decafly-d5x-landing-gear',
  'source-jiyi-terrain-following-radar-for-agriculture-drones',
  'source-skyrc-pc1080-dual-channel-charger-for-agriculture-drone-batteries',
  'source-decafly-d5x-cfrp-frame'
);

update public.mithron_products
set
  interests = array_remove(coalesce(interests, '{}'::text[]), 'surveillance'),
  updated_at = timezone('utc', now())
where slug in (
  'source-nuno-no-tc-required',
  'source-monal-4k',
  'source-monal-4k-thermal'
);

update public.mithron_products
set
  interests = array_append(coalesce(interests, '{}'::text[]), 'surveillance'),
  updated_at = timezone('utc', now())
where slug in (
  'source-nuno-no-tc-required',
  'source-monal-4k',
  'source-monal-4k-thermal'
)
and not (coalesce(interests, '{}'::text[]) @> array['surveillance']::text[]);
