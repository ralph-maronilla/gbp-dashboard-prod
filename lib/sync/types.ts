/** A review normalised for the `reviews` table. */
export interface ProviderReview {
  reviewId: string;
  reviewerName: string | null;
  reviewerUrl: string | null;
  rating: number; // 1..5
  comment: string | null;
  createTime: Date;
  updateTime: Date | null;
  replyComment: string | null;
  replyTime: Date | null;
}
