
"use client";

import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";

interface SignaturePadProps {
    width?: number;
    height?: number;
}

export const SignaturePad = forwardRef<{ clear: () => void; getSignature: () => string | null }, SignaturePadProps>(({ width = 380, height = 180 }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);

    const getCanvasContext = () => canvasRef.current?.getContext('2d') || null;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = getCanvasContext();
        if (!ctx) return;
        
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const getCoordinates = (event: MouseEvent | TouchEvent) => {
            const rect = canvas.getBoundingClientRect();
            if (event instanceof MouseEvent) {
                return { x: event.clientX - rect.left, y: event.clientY - rect.top };
            }
            if (event.touches[0]) {
                return { x: event.touches[0].clientX - rect.left, y: event.touches[0].clientY - rect.top };
            }
            return { x: 0, y: 0 };
        };

        const startDrawing = (event: MouseEvent | TouchEvent) => {
            event.preventDefault();
            const { x, y } = getCoordinates(event);
            ctx.beginPath();
            ctx.moveTo(x, y);
            isDrawing.current = true;
        };

        const draw = (event: MouseEvent | TouchEvent) => {
            if (!isDrawing.current) return;
            event.preventDefault();
            const { x, y } = getCoordinates(event);
            ctx.lineTo(x, y);
            ctx.stroke();
        };

        const stopDrawing = () => {
            if (!isDrawing.current) return;
            ctx.closePath();
            isDrawing.current = false;
        };

        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        window.addEventListener('mouseup', stopDrawing);
        
        canvas.addEventListener('touchstart', startDrawing, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        window.addEventListener('touchend', stopDrawing);

        return () => {
            canvas.removeEventListener('mousedown', startDrawing);
            canvas.removeEventListener('mousemove', draw);
            window.removeEventListener('mouseup', stopDrawing);
            
            canvas.removeEventListener('touchstart', startDrawing);
            canvas.removeEventListener('touchmove', draw);
            window.removeEventListener('touchend', stopDrawing);
        };
    }, []);

    const clearSignature = () => {
        const ctx = getCanvasContext();
        if (ctx && canvasRef.current) {
            ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
    };
    
    const getSignature = (): string | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        
        // Check if canvas is empty
        const context = getCanvasContext();
        if (!context) return null;
        const pixelBuffer = new Uint32Array(
            context.getImageData(0, 0, canvas.width, canvas.height).data.buffer
        );
        const isEmpty = !pixelBuffer.some(color => color !== 0);

        if (isEmpty) return null;

        return canvas.toDataURL('image/png');
    };

    useImperativeHandle(ref, () => ({
        clear: clearSignature,
        getSignature: getSignature
    }));

    return (
        <div className="relative border rounded-md touch-none bg-white">
            <canvas ref={canvasRef} width={width} height={height} />
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={clearSignature}
                className="absolute top-1 right-1 h-7 w-7 text-muted-foreground"
            >
                <Icons.delete className="h-4 w-4" />
                <span className="sr-only">Limpar Assinatura</span>
            </Button>
        </div>
    );
});

SignaturePad.displayName = 'SignaturePad';