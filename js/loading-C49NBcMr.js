const loadingAnimation = {
  v: "5.5.7",
  fr: 30,
  ip: 0,
  op: 60,
  w: 150,
  h: 150,
  nm: "Loading",
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "Spinner",
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: {
          a: 1,
          k: [
            { i: { x: [0.833], y: [0.833] }, o: { x: [0.167], y: [0.167] }, t: 0, s: [0] },
            { t: 60, s: [360] }
          ]
        },
        p: { a: 0, k: [75, 75, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: { a: 0, k: [100, 100, 100] }
      },
      ao: 0,
      shapes: [
        {
          ty: "gr",
          it: [
            {
              d: 1,
              ty: "el",
              s: { a: 0, k: [70, 70] },
              p: { a: 0, k: [0, 0] },
              nm: "Ellipse Path 1"
            },
            {
              ty: "st",
              c: { a: 0, k: [0.188, 0.427, 0.71, 1] },
              o: { a: 0, k: 100 },
              w: { a: 0, k: 6 },
              lc: 2,
              lj: 2,
              d: [
                { n: "d", nm: "dash", v: { a: 0, k: 110 } },
                { n: "g", nm: "gap", v: { a: 0, k: 110 } }
              ],
              nm: "Stroke 1"
            },
            {
              ty: "tr",
              p: { a: 0, k: [0, 0] },
              a: { a: 0, k: [0, 0] },
              s: { a: 0, k: [100, 100] },
              r: { a: 0, k: 0 },
              o: { a: 0, k: 100 },
              sk: 0,
              sa: 0,
              nm: "Transform"
            }
          ],
          nm: "Group 1",
          np: 3,
          cix: 2,
          bm: 0
        }
      ],
      ip: 0,
      op: 60,
      st: 0,
      bm: 0
    }
  ]
};

export default loadingAnimation;
