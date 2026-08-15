// import modules
import { createLowlight } from 'lowlight';
import csharp from 'highlight.js/lib/languages/csharp';

// configuration constants
export const CODE_LANGUAGES = [
    { label: 'C#', value: 'csharp' },
    { label: 'Godot C#', value: 'godot' }
];

const GODOT_TYPES = [
    'GD', 'Mathf', 'Godot', 'GodotObject', 'Variant', 'Callable', 'Signal',
    'Node', 'Node2D', 'Node3D', 'CanvasItem', 'Control', 'Viewport', 'Window',
    'SceneTree', 'PackedScene', 'Resource', 'ResourceLoader', 'ResourceSaver',
    'Engine', 'OS', 'Input', 'InputEvent', 'InputEventKey', 'InputEventMouseButton',
    'ProjectSettings', 'Time', 'RandomNumberGenerator',
    'Vector2', 'Vector2I', 'Vector3', 'Vector3I', 'Vector4', 'Vector4I',
    'Transform2D', 'Transform3D', 'Quaternion', 'Basis', 'Plane', 'Projection',
    'Rect2', 'Rect2I', 'Aabb', 'Color', 'StringName', 'NodePath', 'Rid',
    'CharacterBody2D', 'CharacterBody3D', 'RigidBody2D', 'RigidBody3D',
    'StaticBody2D', 'StaticBody3D', 'Area2D', 'Area3D',
    'CollisionShape2D', 'CollisionShape3D', 'RayCast2D', 'RayCast3D',
    'Sprite2D', 'Sprite3D', 'AnimatedSprite2D', 'AnimationPlayer', 'AnimationTree',
    'Camera2D', 'Camera3D', 'MeshInstance3D', 'Skeleton3D', 'Light2D', 'Light3D',
    'Texture2D', 'Material', 'ShaderMaterial', 'StandardMaterial3D', 'Shader',
    'Timer', 'Tween', 'NavigationAgent2D', 'NavigationAgent3D',
    'Label', 'Button', 'Panel', 'TextureRect', 'LineEdit', 'RichTextLabel',
    'AudioStreamPlayer', 'AudioStreamPlayer2D', 'AudioStreamPlayer3D',
    'PackedByteArray', 'PackedInt32Array', 'PackedInt64Array',
    'PackedFloat32Array', 'PackedFloat64Array', 'PackedStringArray',
    'PackedVector2Array', 'PackedVector3Array', 'PackedColorArray'
];

// utility functions
function godotFlavour(hljs) {
    const base = csharp(hljs);
    const keywords = base.keywords;

    if (!keywords || typeof keywords !== 'object' || !Array.isArray(keywords.built_in)) {
        return base;
    }

    return {
        ...base,
        keywords: {
            ...keywords,
            built_in: [...keywords.built_in, ...GODOT_TYPES]
        }
    };
}

// highlight configuration
export const lowlight = createLowlight();

lowlight.register('csharp', csharp);
lowlight.register('godot', godotFlavour);
