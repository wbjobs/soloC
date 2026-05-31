import React, { useState, useRef, useCallback } from 'react';

export function AnnotationTool({ onAnnotation, color = '#FF0000' }) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [points, setPoints] = useState([]);
  const canvasRef = useRef(null);

  const handleMouseDown = useCallback((e) => {
    setIsDrawing(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setPoints([{ x, y }]);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDrawing) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setPoints(prev => [...prev, { x, y }]);

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (points.length > 0) {
        ctx.beginPath();
        ctx.moveTo(points[points.length - 1].x, points[points.length - 1].y);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }
  }, [isDrawing, points, color]);

  const handleMouseUp = useCallback(() => {
    setIsDrawing(false);
    if (points.length > 2 && onAnnotation) {
      onAnnotation(points);
    }
  }, [points, onAnnotation]);

  const clearCanvas = useCallback(() => {
    setPoints([]);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <canvas
        ref={canvasRef}
        width={512}
        height={512}
        style={{ border: '1px solid #ccc', cursor: 'crosshair' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      <button
        onClick={clearCanvas}
        style={{ position: 'absolute', top: 10, right: 10, padding: '5px 10px' }}
      >
        Clear
      </button>
    </div>
  );
}

export function CommentPanel({ comments, onAddComment }) {
  const [newComment, setNewComment] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newComment.trim() && onAddComment) {
      onAddComment(newComment);
      setNewComment('');
    }
  };

  return (
    <div style={{ width: 300, padding: 10, border: '1px solid #ddd' }}>
      <h3>Comments</h3>
      <form onSubmit={handleSubmit} style={{ marginBottom: 10 }}>
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          style={{ width: '100%', height: 60, marginBottom: 5 }}
          placeholder="Add a comment..."
        />
        <button type="submit">Add Comment</button>
      </form>
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {comments.map((comment, index) => (
          <div key={index} style={{ padding: 8, borderBottom: '1px solid #eee' }}>
            <small>{new Date(comment.createdAt).toLocaleString()}</small>
            <p>{comment.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
