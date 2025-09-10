'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, X, Link, Copy, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const createUrlSchema = z.object({
  identifier: z.string().optional().refine(
    (val) => !val || (val.length >= 2 && val.length <= 20 && /^[a-z0-9][a-z0-9-_]*[a-z0-9]$/.test(val)),
    'Identifier must be 2-20 characters, alphanumeric with hyphens/underscores'
  ),
  keywords: z.array(z.object({
    value: z.string()
      .min(1, 'Keyword is required')
      .max(30, 'Keyword must be at most 30 characters')
      .regex(/^[a-z0-9][a-z0-9-_]*$/, 'Only lowercase letters, numbers, hyphens, and underscores')
  })).min(1, 'At least one keyword is required').max(5, 'Maximum 5 keywords allowed'),
  destination_url: z.string().url('Must be a valid URL'),
  title: z.string().max(255).optional(),
  description: z.string().max(1000).optional(),
});

type FormData = z.infer<typeof createUrlSchema>;

interface CreateUrlFormProps {
  onSuccess?: (data: any) => void;
}

export function CreateUrlForm({ onSuccess }: CreateUrlFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [urlPreview, setUrlPreview] = useState('');
  const [copied, setCopied] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
    reset
  } = useForm<FormData>({
    resolver: zodResolver(createUrlSchema),
    defaultValues: {
      identifier: '',
      keywords: [{ value: '' }],
      destination_url: '',
      title: '',
      description: ''
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'keywords'
  });

  const watchedFields = watch();

  useEffect(() => {
    const identifier = watchedFields.identifier;
    const keywords = watchedFields.keywords
      ?.filter(k => k.value)
      .map(k => k.value.toLowerCase());

    if (keywords && keywords.length > 0) {
      const path = identifier 
        ? `${identifier}/${keywords.join('/')}`
        : keywords.join('/');
      setUrlPreview(`wordsto.link/${path}`);
    } else {
      setUrlPreview('');
    }
  }, [watchedFields.identifier, watchedFields.keywords]);

  const onSubmit = async (data: FormData) => {
    setIsSubmitting(true);
    
    try {
      const response = await fetch('/api/shorten', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          identifier: data.identifier || null,
          keywords: data.keywords.map(k => k.value.toLowerCase()),
          destination_url: data.destination_url,
          title: data.title || null,
          description: data.description || null
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create URL');
      }

      const result = await response.json();
      
      toast.success('URL created successfully!');
      reset();
      
      if (onSuccess) {
        onSuccess(result);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to create URL');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = () => {
    if (urlPreview) {
      navigator.clipboard.writeText(`https://${urlPreview}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Copied to clipboard!');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div>
        <label htmlFor="identifier" className="block text-sm font-medium text-gray-700 mb-1">
          Identifier (Optional)
        </label>
        <input
          type="text"
          {...register('identifier')}
          placeholder="mycompany"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        {errors.identifier && (
          <p className="mt-1 text-sm text-red-600">{errors.identifier.message}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          Your unique namespace (e.g., wordsto.link/mycompany/keyword)
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Keywords
        </label>
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div key={field.id} className="flex gap-2">
              <input
                {...register(`keywords.${index}.value`)}
                placeholder={`Keyword ${index + 1}`}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              {fields.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          ))}
        </div>
        {errors.keywords && (
          <p className="mt-1 text-sm text-red-600">
            {errors.keywords.message || errors.keywords[0]?.value?.message}
          </p>
        )}
        {fields.length < 5 && (
          <button
            type="button"
            onClick={() => append({ value: '' })}
            className="mt-2 flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
          >
            <Plus className="w-4 h-4" />
            Add keyword
          </button>
        )}
      </div>

      <div>
        <label htmlFor="destination_url" className="block text-sm font-medium text-gray-700 mb-1">
          Destination URL
        </label>
        <input
          type="url"
          {...register('destination_url')}
          placeholder="https://example.com/your-page"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        {errors.destination_url && (
          <p className="mt-1 text-sm text-red-600">{errors.destination_url.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
          Title (Optional)
        </label>
        <input
          type="text"
          {...register('title')}
          placeholder="My awesome link"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
        {errors.title && (
          <p className="mt-1 text-sm text-red-600">{errors.title.message}</p>
        )}
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
          Description (Optional)
        </label>
        <textarea
          {...register('description')}
          placeholder="Add a description for your reference"
          rows={3}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
        />
        {errors.description && (
          <p className="mt-1 text-sm text-red-600">{errors.description.message}</p>
        )}
      </div>

      {urlPreview && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-mono text-gray-700">{urlPreview}</span>
            </div>
            <button
              type="button"
              onClick={copyToClipboard}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4 text-gray-600" />
              )}
            </button>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Creating...
          </>
        ) : (
          <>
            <Link className="w-5 h-5" />
            Create Short URL
          </>
        )}
      </button>
    </form>
  );
}