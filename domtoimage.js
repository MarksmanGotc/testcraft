(function(global){
  function toPng(node){
    return new Promise(function(resolve,reject){
      try{
        var clone = node.cloneNode(true);
        var width = node.offsetWidth;
        var height = node.offsetHeight;
        var xmlns = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(xmlns,'svg');
        svg.setAttribute('xmlns', xmlns);
        svg.setAttribute('width', width);
        svg.setAttribute('height', height);
        var foreignObject = document.createElementNS(xmlns,'foreignObject');
        foreignObject.setAttribute('width','100%');
        foreignObject.setAttribute('height','100%');
        foreignObject.appendChild(clone);
        svg.appendChild(foreignObject);
        var svgData = new XMLSerializer().serializeToString(svg);
        var url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
        var img = new Image();
        img.onload = function(){
          var canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          canvas.getContext('2d').drawImage(img,0,0);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = url;
      }catch(err){
        reject(err);
      }
    });
  }
  global.domtoimage = { toPng: toPng };
})(this);
