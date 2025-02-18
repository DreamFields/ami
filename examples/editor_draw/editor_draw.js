/* globals dat*/
// general imports

import CamerasOrthographic from 'base/cameras/cameras.orthographic';
import ControlsOrthographic from 'base/controls/controls.trackballortho';
import HelpersLut from 'base/helpers/helpers.lut';
import HelpersStack from 'base/helpers/helpers.stack';
import LoadersVolume from 'base/loaders/loaders.volume';

// shaders imports
import ShadersLayerUniform from 'base/shaders/shaders.layer.uniform';
import ShadersLayerVertex from 'base/shaders/shaders.layer.vertex';
import ShadersLayerFragment from 'base/shaders/shaders.layer.fragment';
import ShadersDataUniform from 'base/shaders/shaders.data.uniform';
import ShadersDataVertex from 'base/shaders/shaders.data.vertex';
import ShadersDataFragment from 'base/shaders/shaders.data.fragment';

// standard global variables
let controls;
let renderer;
let camera;
let threeD;
let sceneLayer0TextureTarget;
let sceneLayer1TextureTarget;
let sceneLayer0;
let lutLayer0;
let sceneLayer1;
let meshLayer1;
let uniformsLayer1;
let materialLayer1;
let lutLayer1;
let sceneLayerMix;
let meshLayerMix;
let uniformsLayerMix;
let materialLayerMix;
let stackHelper;
let stack2;
let textures2;
let ijkBBox = [99999999, 0, 9999999, 0, 999999999, 0];
let layerMix = {
  opacity1: 1.0,
  lut: null,
};
let canvas;
let canvasDiv;
let context;
let lastPoint = null;
let currentPoint = null;
let isEditing = false;
let isDrawing = false;
let cursor = {
  color: '#d9d9d9',
  value: 0,
  size: 15,
  shape: 'round',
  segment: 'erase',
};
let segmentsList = [];
let segmentsDict = {};
let editorStats = {
  '0': 0,
  '1': 0,
  '2': 0,
};
let firstRender = false;

// FUNCTIONS
/**
 *
 */
function setupEditor() {
  /**
   *
   */
  function distanceBetween(point1, point2) {
    return Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2));
  }

  /**
   *
   */
  function angleBetween(point1, point2) {
    return Math.atan2(point2.x - point1.x, point2.y - point1.y);
  }

  /**
   *
   */
  function initEditorStats() {
    let nbVoxels = stack2._columns * stack2._rows * stack2._frame.length;
    let textureSize = 4096;
    let textureDimension = textureSize * textureSize;

    for (let i = 0; i < nbVoxels; i++) {
      let rawDataIndex = ~~(i / textureDimension);
      let inRawDataIndex = i % textureDimension;
      let value = stack2.rawData[rawDataIndex][inRawDataIndex];
      editorStats[value] += 1;
    }

    updateEditorStatsDom();
  }

  /**
   *
   */
  function updateEditorStatsDom() {
    for (let i = 0; i < 3; i++) {
      document.getElementById(`editorSegment${i}Label`).innerHTML = segmentsList[i];
      document.getElementById(`editorSegment${i}Value`).innerHTML = editorStats[i];
    }
  }

  /**
   *  Loop through IJK BBox and see if voxel can be mapped to screen
   */
  function mapCanvasToData() {
    for (let i = ijkBBox[0]; i < ijkBBox[1] + 1; i++) {
      for (let j = ijkBBox[2]; j < ijkBBox[3] + 1; j++) {
        for (let k = ijkBBox[4]; k < ijkBBox[5] + 1; k++) {
          // ijk to world
          // center of voxel
          let worldCoordinate = new THREE.Vector3(i, j, k).applyMatrix4(stack2._ijk2LPS);
          // world to screen coordinate
          let screenCoordinates = worldCoordinate.clone();
          screenCoordinates.project(camera);

          screenCoordinates.x = Math.round(((screenCoordinates.x + 1) * canvas.offsetWidth) / 2);
          screenCoordinates.y = Math.round(((-screenCoordinates.y + 1) * canvas.offsetHeight) / 2);
          screenCoordinates.z = 0;

          let pixel = context.getImageData(screenCoordinates.x, screenCoordinates.y, 1, 1).data;
          if (pixel[3] > 0 && i >= 0 && j >= 0 && k >= 0) {
            // find index and texture
            let voxelIndex = i + j * stack2._columns + k * stack2._rows * stack2._columns;

            let textureSize = 4096;
            let textureDimension = textureSize * textureSize;

            let rawDataIndex = ~~(voxelIndex / textureDimension);
            let inRawDataIndex = voxelIndex % textureDimension;

            // update value...
            let oldValue = stack2.rawData[rawDataIndex][inRawDataIndex];
            let newValue = cursor.value;

            if (oldValue != newValue) {
              // update raw data
              stack2.rawData[rawDataIndex][inRawDataIndex] = newValue;

              // update texture that is passed to shader
              textures2[rawDataIndex].image.data = stack2.rawData[rawDataIndex]; // tex;
              textures2[rawDataIndex].needsUpdate = true;

              // update stats
              editorStats[oldValue] -= 1;
              editorStats[newValue] += 1;
            }
          }
        }
      }
    }
  }

  /**
   *
   */
  function drawCircle(x, y) {
    context.beginPath();
    context.arc(x, y, cursor.size, false, Math.PI * 2, false);
    context.closePath();
    context.fill();
    context.stroke();
  }

  /**
   *
   */
  function clearCanvas() {
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  }

  /**
   *
   */
  function addEventListeners() {
    /**
     *
     */
    function onMouseDown(e) {
      if (!isEditing) return;

      isDrawing = true;
      lastPoint = {
        x: e.pageX - canvasDiv.offsetLeft,
        y: e.pageY - canvasDiv.offsetTop,
      };
    }

    /**
     *
     */
    function onMouseMove(e) {
      if (!isEditing) return;

      currentPoint = {
        x: e.pageX - canvasDiv.offsetLeft,
        y: e.pageY - canvasDiv.offsetTop,
      };

      context.strokeStyle = cursor.color;
      context.globalCompositeOperation = 'xor';
      context.globalAlpha = 0.5;
      context.fillStyle = cursor.color;

      if (isDrawing) {
        let dist = distanceBetween(lastPoint, currentPoint);
        let angle = angleBetween(lastPoint, currentPoint);

        for (let i = 0; i < dist; i += 5) {
          let x = lastPoint.x + Math.sin(angle) * i;
          let y = lastPoint.y + Math.cos(angle) * i;
          drawCircle(x, y);
        }

        lastPoint = currentPoint;
      } else {
        clearCanvas();
      }

      // draw under the cursor
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1;
      context.fillStyle = 'rgba(0, 0, 0, 0)';
      drawCircle(currentPoint.x, currentPoint.y);
    }

    /**
     *
     */
    function onMouseUp(e) {
      if (!isEditing) return;

      isDrawing = false;
      mapCanvasToData();
      clearCanvas();
      updateEditorStatsDom();
      // draw cursor under mouse
      onMouseMove(e);
    }

    /**
     *
     */
    function updateDOM() {
      // lets events go through or not for scrolling, padding, zooming, etc.
      if (isEditing) {
        canvasDiv.className = 'editing';
        document.getElementById('help').style.display = 'none';
      } else {
        canvasDiv.className = 'exploring';
        document.getElementById('help').style.display = 'block';
      }
    }

    /**
     *
     */
    function onKeyDown(e) {
      if (e.keyCode === 17) {
        isEditing = true;
        isDrawing = false;
        updateDOM();
      }
    }

    /**
     *
     */
    function onKeyUp(e) {
      if (e.keyCode === 17) {
        isEditing = false;
        isDrawing = false;
        clearCanvas();
        updateDOM();
      }
    }

    /**
     *
     */
    function disableRightClick(e) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    // add events listeners
    canvasDiv.addEventListener('mousedown', onMouseDown, false);
    canvasDiv.addEventListener('mousemove', onMouseMove, false);
    canvasDiv.addEventListener('mouseup', onMouseUp, false);
    window.addEventListener('keydown', onKeyDown, false);
    window.addEventListener('keyup', onKeyUp, false);
    canvasDiv.addEventListener('contextmenu', disableRightClick, false);
  }

  addEventListeners();
  initEditorStats();
}

function render() {
  // render
  controls.update();
  // render first layer offscreen
  renderer.render(sceneLayer0, camera, sceneLayer0TextureTarget, true);
  // render second layer offscreen
  renderer.render(sceneLayer1, camera, sceneLayer1TextureTarget, true);
  // mix the layers and render it ON screen!
  renderer.render(sceneLayerMix, camera);
}

/**
 *
 */
function init() {
  /**
   *
   */
  function animate() {
    render();

    // request new frame
    requestAnimationFrame(function() {
      animate();
    });
  }

  // renderer
  threeD = document.getElementById('r3d');
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  renderer.setSize(threeD.clientWidth, threeD.clientHeight);
  renderer.setClearColor(0x607d8b, 1);

  threeD.appendChild(renderer.domElement);

  // canvas 2D
  canvasDiv = document.getElementById('canvasDiv');
  canvas = document.createElement('canvas');
  canvas.setAttribute('width', canvasDiv.clientWidth);
  canvas.setAttribute('height', canvasDiv.clientHeight);
  canvas.setAttribute('id', 'canvas');
  canvasDiv.appendChild(canvas);
  context = canvas.getContext('2d');

  // scene
  sceneLayer0 = new THREE.Scene();
  sceneLayer1 = new THREE.Scene();
  sceneLayerMix = new THREE.Scene();

  // render to texture!!!!
  sceneLayer0TextureTarget = new THREE.WebGLRenderTarget(threeD.clientWidth, threeD.clientHeight, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
  });

  sceneLayer1TextureTarget = new THREE.WebGLRenderTarget(threeD.clientWidth, threeD.clientHeight, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
  });

  // camera
  camera = new CamerasOrthographic(
    threeD.clientWidth / -2,
    threeD.clientWidth / 2,
    threeD.clientHeight / 2,
    threeD.clientHeight / -2,
    0.1,
    10000
  );

  // controls
  controls = new ControlsOrthographic(camera, threeD);
  controls.staticMoving = true;
  controls.noRotate = true;
  camera.controls = controls;

  animate();
}

window.onload = function() {
  // init threeJS...
  init();
  /**
   *
   */
  function updateLayer1() {
    // update layer1 geometry...
    if (meshLayer1) {
      meshLayer1.geometry.dispose();
      meshLayer1.geometry = stackHelper.slice.geometry;
      meshLayer1.geometry.verticesNeedUpdate = true;
    }
  }

  /**
   *
   */
  function updateLayerMix() {
    // update layer1 geometry...
    if (meshLayerMix) {
      sceneLayerMix.remove(meshLayerMix);
      meshLayerMix.material.dispose();
      meshLayerMix.material = null;
      meshLayerMix.geometry.dispose();
      meshLayerMix.geometry = null;

      // add mesh in this scene with right shaders...
      meshLayerMix = new THREE.Mesh(stackHelper.slice.geometry, materialLayerMix);
      // go the LPS space
      meshLayerMix.applyMatrix4(stackHelper.stack._ijk2LPS);

      sceneLayerMix.add(meshLayerMix);
    }
  }

  /**
   *
   */
  function updateIJKBBox() {
    ijkBBox = [stack2._columns, 0, stack2._rows, 0, stack2.frame.length, 0];

    // IJK BBox of the plane
    let slice = stackHelper._slice;
    let vertices = slice._geometry.vertices;
    // to LPS
    for (let i = 0; i < vertices.length; i++) {
      let wc = new THREE.Vector3(vertices[i].x, vertices[i].y, vertices[i].z).applyMatrix4(
        stackHelper.stack._ijk2LPS
      );
      let dc = wc.applyMatrix4(stack2._lps2IJK);
      dc.x = Math.round(dc.x * 10) / 10;
      dc.y = Math.round(dc.y * 10) / 10;
      dc.z = Math.round(dc.z * 10) / 10;

      if (dc.x < ijkBBox[0]) {
        ijkBBox[0] = dc.x;
      }
      if (dc.x > ijkBBox[1]) {
        ijkBBox[1] = dc.x;
      }

      // Y
      if (dc.y < ijkBBox[2]) {
        ijkBBox[2] = dc.y;
      }
      if (dc.y > ijkBBox[3]) {
        ijkBBox[3] = dc.y;
      }

      // Z
      if (dc.z < ijkBBox[4]) {
        ijkBBox[4] = dc.z;
      }
      if (dc.z > ijkBBox[5]) {
        ijkBBox[5] = dc.z;
      }
    }

    // round min up and max down
    ijkBBox[0] = Math.ceil(ijkBBox[0]);
    ijkBBox[2] = Math.ceil(ijkBBox[2]);
    ijkBBox[4] = Math.ceil(ijkBBox[4]);
    ijkBBox[1] = Math.floor(ijkBBox[1]);
    ijkBBox[3] = Math.floor(ijkBBox[3]);
    ijkBBox[5] = Math.floor(ijkBBox[5]);
  }

  /**
   *
   */
  function setupGUI() {
    updateIJKBBox();

    // BUILD THE GUI
    let gui = new dat.GUI({
      autoPlace: false,
    });
    let customContainer = document.getElementById('my-gui-container');
    customContainer.appendChild(gui.domElement);

    // PET FOLDER
    let layer0Folder = gui.addFolder('PET');

    let indexUpdate = layer0Folder
      .add(stackHelper, 'index', 245, 253)
      .step(1)
      .listen();
    indexUpdate.onChange(function() {
      updateLayer1();
      updateLayerMix();
      updateIJKBBox();
    });

    let updateInterpolation = layer0Folder.add(stackHelper.slice, 'interpolation');
    updateInterpolation.onChange(function(value) {
      if (value) {
        stackHelper.slice.interpolation = 1;
      } else {
        stackHelper.slice.interpolation = 0;
      }
    });
    layer0Folder.open();

    // SEGMENTATION FOLDER
    let layerMixFolder = gui.addFolder('Segmentation');

    let opacityLayerMix1 = layerMixFolder.add(layerMix, 'opacity1', 0, 1).step(0.01);
    opacityLayerMix1.onChange(function(value) {
      uniformsLayerMix.uOpacity1.value = value;
    });

    layerMixFolder.open();

    // EDITOR FODLER
    let editorFolder = gui.addFolder('Editor');
    editorFolder.add(cursor, 'size', 1, 50).step(1);
    let brushSegment = editorFolder.add(cursor, 'segment', segmentsList);
    brushSegment.onChange(function(value) {
      // update color and value
      cursor.value = segmentsDict[value].value;
      cursor.color = segmentsDict[value].color;
    });

    editorFolder.open();
  }

  /**
   *
   */
  function addListeners() {
    /**
     *
     */
    function onScroll(e) {
      if (e.delta > 0) {
        if (stackHelper.index >= 253) {
          return false;
        }
        stackHelper.index += 1;
      } else {
        if (stackHelper.index <= 245) {
          return false;
        }
        stackHelper.index -= 1;
      }

      updateLayer1();
      updateLayerMix();
      updateIJKBBox();
    }

    /**
     *
     */
    function onWindowResize() {
      let threeD = document.getElementById('r3d');
      camera.canvas = {
        width: threeD.clientWidth,
        height: threeD.clientHeight,
      };
      camera.fitBox(2);

      renderer.setSize(threeD.clientWidth, threeD.clientHeight);

      canvas.setAttribute('width', canvasDiv.clientWidth);
      canvas.setAttribute('height', canvasDiv.clientHeight);
    }
    onWindowResize();

    controls.addEventListener('OnScroll', onScroll);
    window.addEventListener('resize', onWindowResize, false);
  }

  /**
   *
   */
  function handleSeries() {
    //
    //
    // first stack of first series
    let mergedSeries = loader.data[0].mergeSeries(loader.data);
    loader.free();
    loader = null;

    let stack = mergedSeries[0].stack[0];
    stack2 = mergedSeries[1].stack[0];

    if (stack.modality === 'SEG') {
      stack = mergedSeries[0].stack[0];
      stack2 = mergedSeries[1].stack[0];
    }

    stackHelper = new HelpersStack(stack);
    stackHelper.bbox.visible = false;
    stackHelper.border.visible = false;
    stackHelper.index = 247;
    stackHelper.slice.interpolation = false;

    sceneLayer0.add(stackHelper);

    //
    //
    // create labelmap....
    // we only care about the geometry....
    // get first stack from series
    // prepare it
    // * ijk2LPS transforms
    // * Z spacing
    // * etc.
    //
    stack2.prepare();
    // pixels packing for the fragment shaders now happens there
    stack2.pack();

    // store segments info
    // add "eraser"
    segmentsList = ['erase'];
    segmentsDict = {
      erase: {
        color: '#d9d9d9',
        value: 0,
      },
    };

    // add labels
    for (let i = 0; i < stack2._segmentationSegments.length; i++) {
      let label = stack2._segmentationSegments[i].segmentLabel;
      let number = stack2._segmentationSegments[i].segmentNumber;
      segmentsList.push(label);
      segmentsDict[label] = {
        color: `rgba(
          ${Math.round(stack2._segmentationLUT[number][1] * 255)},
          ${Math.round(stack2._segmentationLUT[number][2] * 255)},
          ${Math.round(stack2._segmentationLUT[number][3] * 255)},
          1)`,
        value: number,
      };
    }

    textures2 = [];
    for (let m = 0; m < stack2._rawData.length; m++) {
      let tex = new THREE.DataTexture(
        stack2.rawData[m],
        stack2.textureSize,
        stack2.textureSize,
        stack2.textureType,
        THREE.UnsignedByteType,
        THREE.UVMapping,
        THREE.ClampToEdgeWrapping,
        THREE.ClampToEdgeWrapping,
        THREE.NearestFilter,
        THREE.NearestFilter
      );
      tex.needsUpdate = true;
      tex.flipY = true;
      textures2.push(tex);
    }

    // create material && mesh then add it to sceneLayer1
    uniformsLayer1 = ShadersDataUniform.uniforms();
    uniformsLayer1.uTextureSize.value = stack2.textureSize;
    uniformsLayer1.uTextureContainer.value = textures2;
    uniformsLayer1.uWorldToData.value = stack2.lps2IJK;
    uniformsLayer1.uNumberOfChannels.value = stack2.numberOfChannels;
    uniformsLayer1.uPixelType.value = stack2.pixelType;
    uniformsLayer1.uBitsAllocated.value = stack2.bitsAllocated;
    uniformsLayer1.uPackedPerPixel.value = stack2.packedPerPixel;
    uniformsLayer1.uWindowCenterWidth.value = [stack2.windowCenter, stack2.windowWidth];
    uniformsLayer1.uRescaleSlopeIntercept.value = [stack2.rescaleSlope, stack2.rescaleIntercept];
    uniformsLayer1.uDataDimensions.value = [
      stack2.dimensionsIJK.x,
      stack2.dimensionsIJK.y,
      stack2.dimensionsIJK.z,
    ];
    uniformsLayer1.uInterpolation.value = 0;
    uniformsLayer1.uLowerUpperThreshold.value = [...stack2.minMax];

    // generate shaders on-demand!
    let fs = new ShadersDataFragment(uniformsLayer1);
    let vs = new ShadersDataVertex();
    materialLayer1 = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: uniformsLayer1,
      vertexShader: vs.compute(),
      fragmentShader: fs.compute(),
    });

    // add mesh in this scene with right shaders...
    meshLayer1 = new THREE.Mesh(stackHelper.slice.geometry, materialLayer1);
    // go the LPS space
    meshLayer1.applyMatrix4(stack._ijk2LPS);
    sceneLayer1.add(meshLayer1);

    // Create the Mix layer
    uniformsLayerMix = ShadersLayerUniform.uniforms();
    uniformsLayerMix.uTextureBackTest0.value = sceneLayer0TextureTarget.texture;
    uniformsLayerMix.uTextureBackTest1.value = sceneLayer1TextureTarget.texture;

    let fls = new ShadersLayerFragment(uniformsLayerMix);
    let vls = new ShadersLayerVertex();
    materialLayerMix = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: uniformsLayerMix,
      vertexShader: vls.compute(),
      fragmentShader: fls.compute(),
      transparent: true,
    });

    // add mesh in this scene with right shaders...
    meshLayerMix = new THREE.Mesh(stackHelper.slice.geometry, materialLayerMix);
    // go the LPS space
    meshLayerMix.applyMatrix4(stack._ijk2LPS);
    sceneLayerMix.add(meshLayerMix);

    //
    // set camera
    let worldbb = stack.worldBoundingBox();
    let lpsDims = new THREE.Vector3(
      worldbb[1] - worldbb[0],
      worldbb[3] - worldbb[2],
      worldbb[5] - worldbb[4]
    );

    // box: {halfDimensions, center}
    let box = {
      center: stack.worldCenter().clone(),
      halfDimensions: new THREE.Vector3(lpsDims.x + 10, lpsDims.y + 10, lpsDims.z + 10),
    };

    // init and zoom
    let canvas = {
      width: threeD.clientWidth,
      height: threeD.clientHeight,
    };
    camera.directions = [stack.xCosine, stack.yCosine, stack.zCosine];
    camera.box = box;
    camera.canvas = canvas;
    camera.update();
    camera.fitBox(2);

    // CREATE LUT
    lutLayer0 = new HelpersLut(
      'my-lut-canvases-l0',
      'default',
      'linear',
      [[0, 0, 0, 0], [1, 1, 1, 1]],
      [[0, 1], [1, 1]]
    );
    lutLayer0.luts = HelpersLut.presetLuts();
    lutLayer0.lut = 'random';
    stackHelper.slice.lut = 1;
    stackHelper.slice.lutTexture = lutLayer0.texture;

    lutLayer1 = new HelpersLut(
      'my-lut-canvases-l1',
      'default',
      'linear',
      stack2.segmentationLUT,
      stack2.segmentationLUTO,
      true
    );
    uniformsLayer1.uLut.value = 1;
    uniformsLayer1.uTextureLUT.value = lutLayer1.texture;
  }

  let filenames = [
    '000000.dcm',
    '000001.dcm',
    '000002.dcm',
    '000003.dcm',
    '000004.dcm',
    '000005.dcm',
    '000006.dcm',
    '000007.dcm',
    '000008.dcm',
    '000009.dcm',
    '000010.dcm',
    '000011.dcm',
    '000012.dcm',
    '000013.dcm',
    '000014.dcm',
    '000015.dcm',
    '000016.dcm',
    '000017.dcm',
    '000018.dcm',
    '000019.dcm',
    '000020.dcm',
    '000021.dcm',
    '000022.dcm',
    '000023.dcm',
    '000024.dcm',
    '000025.dcm',
    '000026.dcm',
    '000027.dcm',
    '000028.dcm',
    '000029.dcm',
    '000030.dcm',
    '000031.dcm',
    '000032.dcm',
    '000033.dcm',
    '000034.dcm',
    '000035.dcm',
    '000036.dcm',
    '000037.dcm',
    '000038.dcm',
    '000039.dcm',
    '000040.dcm',
    '000041.dcm',
    '000042.dcm',
    '000043.dcm',
    '000044.dcm',
    '000045.dcm',
    '000046.dcm',
    '000047.dcm',
    '000048.dcm',
    '000049.dcm',
    '000050.dcm',
    '000051.dcm',
    '000052.dcm',
    '000053.dcm',
    '000054.dcm',
    '000055.dcm',
    '000056.dcm',
    '000057.dcm',
    '000058.dcm',
    '000059.dcm',
    '000060.dcm',
    '000061.dcm',
    '000062.dcm',
    '000063.dcm',
    '000064.dcm',
    '000065.dcm',
    '000066.dcm',
    '000067.dcm',
    '000068.dcm',
    '000069.dcm',
    '000070.dcm',
    '000071.dcm',
    '000072.dcm',
    '000073.dcm',
    '000074.dcm',
    '000075.dcm',
    '000076.dcm',
    '000077.dcm',
    '000078.dcm',
    '000079.dcm',
    '000080.dcm',
    '000081.dcm',
    '000082.dcm',
    '000083.dcm',
    '000084.dcm',
    '000085.dcm',
    '000086.dcm',
    '000087.dcm',
    '000088.dcm',
    '000089.dcm',
    '000090.dcm',
    '000091.dcm',
    '000092.dcm',
    '000093.dcm',
    '000094.dcm',
    '000095.dcm',
    '000096.dcm',
    '000097.dcm',
    '000098.dcm',
    '000099.dcm',
    '000100.dcm',
    '000101.dcm',
    '000102.dcm',
    '000103.dcm',
    '000104.dcm',
    '000105.dcm',
    '000106.dcm',
    '000107.dcm',
    '000108.dcm',
    '000109.dcm',
    '000110.dcm',
    '000111.dcm',
    '000112.dcm',
    '000113.dcm',
    '000114.dcm',
    '000115.dcm',
    '000116.dcm',
    '000117.dcm',
    '000118.dcm',
    '000119.dcm',
    '000120.dcm',
    '000121.dcm',
    '000122.dcm',
    '000123.dcm',
    '000124.dcm',
    '000125.dcm',
    '000126.dcm',
    '000127.dcm',
    '000128.dcm',
    '000129.dcm',
    '000130.dcm',
    '000131.dcm',
    '000132.dcm',
    '000133.dcm',
    '000134.dcm',
    '000135.dcm',
    '000136.dcm',
    '000137.dcm',
    '000138.dcm',
    '000139.dcm',
    '000140.dcm',
    '000141.dcm',
    '000142.dcm',
    '000143.dcm',
    '000144.dcm',
    '000145.dcm',
    '000146.dcm',
    '000147.dcm',
    '000148.dcm',
    '000149.dcm',
    '000150.dcm',
    '000151.dcm',
    '000152.dcm',
    '000153.dcm',
    '000154.dcm',
    '000155.dcm',
    '000156.dcm',
    '000157.dcm',
    '000158.dcm',
    '000159.dcm',
    '000160.dcm',
    '000161.dcm',
    '000162.dcm',
    '000163.dcm',
    '000164.dcm',
    '000165.dcm',
    '000166.dcm',
    '000167.dcm',
    '000168.dcm',
    '000169.dcm',
    '000170.dcm',
    '000171.dcm',
    '000172.dcm',
    '000173.dcm',
    '000174.dcm',
    '000175.dcm',
    '000176.dcm',
    '000177.dcm',
    '000178.dcm',
    '000179.dcm',
    '000180.dcm',
    '000181.dcm',
    '000182.dcm',
    '000183.dcm',
    '000184.dcm',
    '000185.dcm',
    '000186.dcm',
    '000187.dcm',
    '000188.dcm',
    '000189.dcm',
    '000190.dcm',
    '000191.dcm',
    '000192.dcm',
    '000193.dcm',
    '000194.dcm',
    '000195.dcm',
    '000196.dcm',
    '000197.dcm',
    '000198.dcm',
    '000199.dcm',
    '000200.dcm',
    '000201.dcm',
    '000202.dcm',
    '000203.dcm',
    '000204.dcm',
    '000205.dcm',
    '000206.dcm',
    '000207.dcm',
    '000208.dcm',
    '000209.dcm',
    '000210.dcm',
    '000211.dcm',
    '000212.dcm',
    '000213.dcm',
    '000214.dcm',
    '000215.dcm',
    '000216.dcm',
    '000217.dcm',
    '000218.dcm',
    '000219.dcm',
    '000220.dcm',
    '000221.dcm',
    '000222.dcm',
    '000223.dcm',
    '000224.dcm',
    '000225.dcm',
    '000226.dcm',
    '000227.dcm',
    '000228.dcm',
    '000229.dcm',
    '000230.dcm',
    '000231.dcm',
    '000232.dcm',
    '000233.dcm',
    '000234.dcm',
    '000235.dcm',
    '000236.dcm',
    '000237.dcm',
    '000238.dcm',
    '000239.dcm',
    '000240.dcm',
    '000241.dcm',
    '000242.dcm',
    '000243.dcm',
    '000244.dcm',
    '000245.dcm',
    '000246.dcm',
    '000247.dcm',
    '000248.dcm',
    '000249.dcm',
    '000250.dcm',
    '000251.dcm',
    '000252.dcm',
    '000253.dcm',
    '000254.dcm',
    '000255.dcm',
    '000256.dcm',
    '000257.dcm',
    '000258.dcm',
    '000259.dcm',
    '000260.dcm',
    '000261.dcm',
    '000262.dcm',
    '000263.dcm',
    '000264.dcm',
    '000265.dcm',
    '000266.dcm',
    '000267.dcm',
    '000268.dcm',
    '000269.dcm',
    '000270.dcm',
    '000271.dcm',
    '000272.dcm',
    '000273.dcm',
    '000274.dcm',
    '000275.dcm',
    '000276.dcm',
    '000277.dcm',
    '000278.dcm',
    '000279.dcm',
    '000280.dcm',
    '000281.dcm',
    '000282.dcm',
    '000283.dcm',
    '000284.dcm',
    '000285.dcm',
    '000286.dcm',
    '000287.dcm',
    '000288.dcm',
    '000289.dcm',
    '000290.dcm',
    '000291.dcm',
    '000292.dcm',
    '000293.dcm',
    '000294.dcm',
    '000295.dcm',
    '000296.dcm',
    '000297.dcm',
    '000298.dcm',
  ];

  let files = filenames.map(function(v) {
    return 'https://cdn.rawgit.com/FNNDSC/data/master/dicom/rsna_2/PET/' + v;
  });

  files.push(
    'https://cdn.rawgit.com/FNNDSC/data/master/dicom/rsna_2/SEG/3DSlicer/tumor_User1_Manual_Trial1.dcm'
  );

  console.log('files', files);

  // load sequence for each file
  // it loads and parses the dicom image
  let loader = new LoadersVolume(threeD);

  loader
    .load(files)
    .then(function() {
      handleSeries();
      addListeners();
      setupGUI();
      setupEditor();
      // force 1st render
      render();
      // notify puppeteer to take screenshot
      const puppetDiv = document.createElement('div');
      puppetDiv.setAttribute('id', 'puppeteer');
      document.body.appendChild(puppetDiv);
    })
    .catch(function(error) {
      console.log('err', error);
      window.console.log('oops... something went wrong...');
      window.console.log(error);
    });
};
