<?php

declare(strict_types=1);

namespace App\Rules;

use Closure;
use GuzzleHttp\Exception\TransferException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

final class ValidTurnstile
{
    public const string VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    /** @param Closure(string): void $fail */
    public function validate(string $attribute, string $value, Closure $fail): void
    {
        $secret = config('services.turnstile.secret_key');
        if (!is_string($secret) || $secret === '') {
            $fail(__('validation.invalid_captcha'));

            return;
        }

        try {
            $response = Http::asForm()->connectTimeout(3)->timeout(10)->post(self::VERIFY_URL, [
                'secret' => $secret,
                'response' => $value,
            ]);
        } catch (ConnectionException|TransferException) {
            $fail(__('validation.invalid_captcha'));

            return;
        }

        if (!$response->successful() || $response->json('success') !== true || $response->json('action') !== 'form_submit') {
            $fail(__('validation.invalid_captcha'));
        }
    }
}
