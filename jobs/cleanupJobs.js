// from typing import List
// def max_sum_of_subarrays(arr: List[int], k: int) -> int:
//     """
//     You are given an array of integers `arr` and an integer `k`. Your task is to
//     find the maximum sum of any subarray of size `k` in the given array. A subarray
//     is a contiguous part of the array. As a reminder, your code has to be in python
//     """
//     if not arr or k <= 0 or k > len(arr):
//         return 0
//     # Calculate the sum of the first window of size k
//     max_sum = window_sum = sum(arr[:k])
//     # Slide the window from start to end of the array
//     for i in range(len(arr) - k):
//         # Slide the window by subtracting the element going out and adding the element coming in
//         window_sum = window_sum - arr[i] + arr[i + k]
//         max_sum = max(max_sum, window_sum)
//     return max_sum  